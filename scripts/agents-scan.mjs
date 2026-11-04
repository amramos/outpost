// Reads the session stores of external coding agents and prints compact JSON
// for the outpost mod. One adapter per provider, one shape out:
//
//   node agents-scan.mjs list <hours>          recent sessions of every provider
//   node agents-scan.mjs show <provider> <ref> one session's timeline
//   node agents-scan.mjs where <provider>      argv that starts the CLI, no shell
//
// Session:  { provider, id, ref, cwd, originator?, model?, title, status,
//             lastAction?, lastMessage?, tokens?, startedAt?, updatedAt }
// Timeline: [{ t?, kind, text, status?, detail?, images? }]  images: absolute
//             paths of pictures the step shows (attached, generated, written)  kind: user | agent | note |
//             think | cmd | tool | web | edit | image | turn | error | other
//
// Everything is read-only. Codex and Copilot logs are read head and tail only
// in `list` (they can be tens of MB); opencode's SQLite database is queried
// for its session, message and part tables only, never its account tables.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { execFileSync } from 'node:child_process'

const HEAD = 1_500_000
const TAIL = 512_000
const STALL_MS = 15 * 60_000
const MAX_PER_PROVIDER = 25

// ── helpers ──────────────────────────────────────────────────────────────
function readRange(file, start, length) {
  const fd = fs.openSync(file, 'r')
  try {
    const buf = Buffer.alloc(length)
    const n = fs.readSync(fd, buf, 0, length, start)
    return buf.subarray(0, n).toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

function parseLines(text, { dropFirst = false, dropLast = false } = {}) {
  const lines = text.split('\n')
  if (dropFirst) lines.shift()
  if (dropLast) lines.pop()
  const out = []
  for (const line of lines) {
    if (!line.trim()) continue
    try {
      out.push(JSON.parse(line))
    } catch {}
  }
  return out
}

/** Head and tail lines of a JSONL file, without reading the middle. */
function headAndTail(file, size) {
  const head = parseLines(readRange(file, 0, Math.min(size, HEAD)), { dropLast: size > HEAD })
  const tailStart = Math.max(0, size - TAIL)
  const tail = tailStart === 0 ? [] : parseLines(readRange(file, tailStart, TAIL), { dropFirst: true })
  return { head, all: tailStart === 0 ? head : [...head, ...tail] }
}

async function* jsonLines(file) {
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!line.trim()) continue
    try {
      yield JSON.parse(line)
    } catch {}
  }
}

const clip = (s, n) => {
  const one = String(s ?? '').replace(/\s+/g, ' ').trim()
  return one.length > n ? one.slice(0, n - 1) + '…' : one
}
const textOf = content =>
  (Array.isArray(content) ? content : [])
    .map(c => c?.text ?? '')
    .filter(Boolean)
    .join('\n')
const iso = ms => (typeof ms === 'number' && ms > 0 ? new Date(ms).toISOString() : undefined)

function statOrNull(file) {
  try {
    return fs.statSync(file)
  } catch {
    return null
  }
}

function settle(state, updatedAt) {
  const quiet = Date.now() - updatedAt
  if (state === 'running' && quiet > STALL_MS) return 'stalled'
  if (state === 'unknown') return quiet < 120_000 ? 'running' : 'idle'
  return state
}

const IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i
const isImagePath = p => typeof p === 'string' && IMAGE_EXT.test(p)
/** An absolute path for `p`, resolved against `cwd` when relative. */
const absPath = (p, cwd) => {
  const clean = String(p).replace(/^file:\/\/\/?/, '')
  return path.isAbsolute(clean) || !cwd ? clean : path.join(cwd, clean)
}
const codexGenerated = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'generated_images')

// The folder of the session `show` is reading (set by each provider's show).
let showCwd = ''

const MENTION_LINK = /\]\(\s*<?([^)>\s]+\.(?:png|jpe?g|webp|gif|bmp))>?\s*\)/gi
// a bare path has no spaces (one with spaces is found as a Markdown link)
const MENTION_PATH = /(?:^|[\s`'"(])((?:[A-Za-z]:[\\/]|\.{0,2}[\\/])?[\w.\-\\/]*?[\w-]+\.(?:png|jpe?g|webp|gif|bmp))(?=$|[\s`'"),.;:!?])/gim

/**
 * Pictures an agent's reply points at (a Markdown link or a plain path) that
 * exist on disk: a picture made by a script or command, not a file tool,
 * still shows under the reply that names it.
 */
function attachMentionedImages(items, cwd) {
  for (const e of items) {
    if (e.kind !== 'agent' && e.kind !== 'note') continue
    const found = new Set(e.images ?? [])
    const text = String(e.text ?? '')
    for (const re of [MENTION_LINK, MENTION_PATH]) {
      re.lastIndex = 0
      for (const m of text.matchAll(re)) {
        let ref = m[1].trim()
        try {
          ref = decodeURIComponent(ref)
        } catch {}
        const file = absPath(ref, cwd)
        if (found.size < 4 && isImagePath(file) && fs.existsSync(file)) found.add(path.normalize(file))
      }
    }
    if (found.size) e.images = [...found]
  }
  return items
}

const SHELL_TOOLS = new Set(['bash', 'shell', 'powershell', 'pwsh', 'cmd', 'exec_command', 'run_command'])

// ── Codex: ~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl ─────────────────
const codexRoot = path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'sessions')

function codexEntry(item, t, ctx = {}) {
  switch (item.type) {
    case 'UserMessage': {
      const images = (item.content ?? [])
        .filter(c => c?.type === 'local_image' && c.path)
        .map(c => absPath(c.path, ctx.cwd))
      return { t, kind: 'user', text: textOf(item.content), ...(images.length ? { images } : {}) }
    }
    case 'AgentMessage':
      return { t, kind: item.phase === 'commentary' ? 'note' : 'agent', text: textOf(item.content) }
    case 'Reasoning': {
      const s = (item.summary_text ?? []).join('\n\n')
      return { t, kind: 'think', text: s || 'Thinking…' }
    }
    case 'CommandExecution': {
      const code = item.exit_code ?? item.exitCode
      const argv = Array.isArray(item.command) ? item.command : [item.command]
      return {
        t,
        kind: 'cmd',
        text: item.parsed_cmd?.[0]?.cmd ?? argv[argv.length - 1] ?? '',
        status: item.status === 'completed' && code !== undefined && code !== 0 ? `exit ${code}` : item.status,
        detail: clip(item.aggregated_output, 600),
      }
    }
    case 'McpToolCall':
      return {
        t,
        kind: 'tool',
        text: `${item.server}.${item.tool}`,
        status: item.status,
        detail: item.error?.message ? clip(item.error.message, 300) : undefined,
      }
    case 'Extension': {
      if (item.kind === 'image_gen.generation') {
        // Codex saves each generated picture as generated_images/<session>/<item id>.png
        const file = ctx.sessionId ? path.join(codexGenerated, ctx.sessionId, `${item.id}.png`) : null
        return {
          t,
          kind: 'image',
          text: item.revisedPrompt || 'Generated image',
          status: item.status,
          ...(file && fs.existsSync(file) ? { images: [file] } : {}),
        }
      }
      return { t, kind: 'web', text: `${item.kind}: ${item.query ?? item.action?.url ?? ''}` }
    }
    case 'ImageView': {
      const file = absPath(item.path ?? '', ctx.cwd)
      return { t, kind: 'tool', text: `view image: ${file}`, ...(isImagePath(file) ? { images: [file] } : {}) }
    }
    case 'FileChange':
    case 'PatchApply': {
      const files = Object.keys(item.changes ?? {})
      return { t, kind: 'edit', text: files.length ? files.join(', ') : 'Edited files', status: item.status }
    }
    default:
      return { t, kind: 'other', text: item.type ?? 'event' }
  }
}

function codexList(hours) {
  const cutoff = Date.now() - hours * 3_600_000
  const files = []
  for (let d = 0; d <= Math.ceil(hours / 24) + 1; d++) {
    const dt = new Date(Date.now() - d * 86_400_000)
    const dir = path.join(codexRoot, String(dt.getFullYear()), String(dt.getMonth() + 1).padStart(2, '0'), String(dt.getDate()).padStart(2, '0'))
    let names = []
    try {
      names = fs.readdirSync(dir)
    } catch {
      continue
    }
    for (const name of names) {
      if (!name.endsWith('.jsonl')) continue
      const file = path.join(dir, name)
      const stat = statOrNull(file) // may vanish between listing and stat
      if (stat && stat.mtimeMs >= cutoff) files.push({ file, stat })
    }
  }
  files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  const out = []
  for (const { file, stat } of files.slice(0, MAX_PER_PROVIDER)) {
    try {
      const { head, all } = headAndTail(file, stat.size)
      const meta = head.find(o => o.type === 'session_meta')?.payload ?? {}
      const firstUser = head.find(o => o.payload?.type === 'item_completed' && o.payload.item?.type === 'UserMessage')
      let model
      let state = 'unknown'
      let lastAction
      let lastMessage
      let tokens
      for (const o of all) {
        const p = o.payload ?? {}
        if (o.type === 'turn_context' && p.model) model = p.model
        if (p.type === 'thread_settings_applied' && p.thread_settings?.model) model = p.thread_settings.model
        if (p.type === 'task_started') state = 'running'
        if (p.type === 'task_complete') {
          state = 'completed'
          if (p.last_agent_message) lastMessage = p.last_agent_message
        }
        if (p.type === 'token_count' && p.info?.total_token_usage) tokens = p.info.total_token_usage.total_tokens
        if (p.type === 'item_completed' && p.item && p.item.type !== 'UserMessage') {
          const e = codexEntry(p.item, o.timestamp)
          if (e.kind !== 'think') lastAction = `${e.kind === 'cmd' ? '$ ' : ''}${e.text}`
        }
      }
      out.push({
        provider: 'codex',
        id: meta.id ?? meta.session_id ?? path.basename(file, '.jsonl').slice(-36),
        ref: file,
        cwd: meta.cwd ?? '',
        originator: meta.originator,
        model,
        title: clip(textOf(firstUser?.payload.item.content).split('\n')[0], 90) || 'Codex session',
        status: settle(state, stat.mtimeMs),
        lastAction: lastAction ? clip(lastAction, 120) : undefined,
        lastMessage: lastMessage ? clip(lastMessage, 400) : undefined,
        tokens,
        startedAt: meta.timestamp,
        updatedAt: stat.mtimeMs,
      })
    } catch {}
  }
  return out
}

async function codexShow(file) {
  const items = []
  const ctx = {}
  const lines = readline.createInterface({ input: fs.createReadStream(file, 'utf8'), crlfDelay: Infinity })
  for await (const line of lines) {
    if (!ctx.sessionId && line.includes('"session_meta"')) {
      try {
        const m = JSON.parse(line).payload ?? {}
        ctx.sessionId = m.id ?? m.session_id
        ctx.cwd = m.cwd
        showCwd = m.cwd ?? ''
      } catch {}
      continue
    }
    if (!line.includes('"item_completed"') && !line.includes('"task_')) continue // skip big context lines unparsed
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    const p = o.payload ?? {}
    if (p.type === 'item_completed' && p.item) items.push(codexEntry(p.item, o.timestamp, ctx))
    else if (p.type === 'task_started') items.push({ t: o.timestamp, kind: 'turn', text: 'Turn started' })
    else if (p.type === 'task_complete') items.push({ t: o.timestamp, kind: 'turn', text: 'Turn finished' })
  }
  return items
}

// ── opencode: ~/.local/share/opencode/opencode.db (SQLite) ──────────────
const opencodeDb = path.join(
  process.env.XDG_DATA_HOME ?? path.join(os.homedir(), '.local', 'share'),
  'opencode',
  'opencode.db',
)

async function openOpencode() {
  if (!fs.existsSync(opencodeDb)) return null
  const { DatabaseSync } = await import('node:sqlite')
  return new DatabaseSync(opencodeDb, { readOnly: true })
}

const json = s => {
  try {
    return JSON.parse(s)
  } catch {
    return {}
  }
}

function opencodeModel(raw) {
  const m = json(raw ?? '')
  return m.id ?? m.modelID ?? undefined
}

function opencodePartEntry(part, role, t) {
  switch (part.type) {
    case 'text':
      if (part.synthetic) return null
      // `opencode run "msg"` stores the message with its quotes kept
      return role === 'user'
        ? { t, kind: 'user', text: String(part.text ?? '').replace(/^"([\s\S]*)"$/, '$1') }
        : { t, kind: 'agent', text: part.text ?? '' }
    case 'reasoning':
      return { t, kind: 'think', text: String(part.text ?? '').trim() || 'Thinking…' }
    case 'tool': {
      const st = part.state ?? {}
      const status = st.status === 'error' ? 'failed' : st.status
      if (SHELL_TOOLS.has(part.tool)) {
        return { t, kind: 'cmd', text: st.input?.command ?? st.title ?? part.tool, status, detail: clip(st.output ?? st.error, 600) }
      }
      if (part.tool === 'webfetch' || part.tool === 'websearch') {
        return { t, kind: 'web', text: `${part.tool}: ${st.input?.url ?? st.input?.query ?? st.title ?? ''}`, status }
      }
      const target = st.input?.filePath ?? st.input?.path
      return {
        t,
        kind: 'tool',
        text: `${part.tool}${st.title ? `: ${st.title}` : ''}`,
        status,
        detail: st.error ? clip(st.error, 300) : undefined,
        ...(isImagePath(target) && fs.existsSync(target) ? { images: [target] } : {}),
      }
    }
    case 'patch': {
      const images = (part.files ?? []).filter(f => isImagePath(f) && fs.existsSync(f))
      return {
        t,
        kind: 'edit',
        text: (part.files ?? []).map(f => path.basename(f)).join(', ') || 'Edited files',
        ...(images.length ? { images } : {}),
      }
    }
    default:
      return null // step-start, step-finish, snapshot, ...
  }
}

async function opencodeList(hours) {
  const db = await openOpencode()
  if (!db) return []
  try {
    const since = Date.now() - hours * 3_600_000
    const sessions = db
      .prepare(
        `select id, title, directory, model, time_created, time_updated,
                tokens_input + tokens_output + tokens_reasoning as tokens
           from session
          where time_updated >= ? and parent_id is null and time_archived is null
          order by time_updated desc limit ?`,
      )
      .all(since, MAX_PER_PROVIDER)
    const lastMsg = db.prepare(`select data from message where session_id = ? order by time_created desc limit 1`)
    const lastText = db.prepare(
      `select p.data from part p join message m on m.id = p.message_id
        where p.session_id = ? and json_extract(p.data, '$.type') = 'text'
          and json_extract(m.data, '$.role') = 'assistant'
        order by p.time_created desc limit 1`,
    )
    const lastAct = db.prepare(
      `select data from part where session_id = ? and json_extract(data, '$.type') in ('tool', 'text', 'patch')
        order by time_created desc limit 1`,
    )
    return sessions.map(s => {
      const m = json(lastMsg.get(s.id)?.data)
      let state = 'unknown'
      if (m.role === 'user') state = 'running'
      else if (m.role === 'assistant') state = m.error ? 'failed' : m.time?.completed ? 'completed' : 'running'
      const act = json(lastAct.get(s.id)?.data)
      const e = act.type ? opencodePartEntry(act, 'assistant') : null
      return {
        provider: 'opencode',
        id: s.id,
        ref: s.id,
        cwd: s.directory ?? '',
        model: opencodeModel(s.model) ?? m.modelID,
        title: clip(s.title, 90) || 'opencode session',
        status: settle(state, s.time_updated),
        lastAction: e ? clip(`${e.kind === 'cmd' ? '$ ' : ''}${e.text}`, 120) : undefined,
        lastMessage: m.error ? clip(m.error.data?.message ?? m.error.name, 400) : clip(json(lastText.get(s.id)?.data).text, 400) || undefined,
        error: m.error ? clip(m.error.data?.message ?? m.error.name, 300) : undefined,
        tokens: s.tokens || undefined,
        startedAt: iso(s.time_created),
        updatedAt: s.time_updated,
      }
    })
  } finally {
    db.close()
  }
}

const s_cwd = m => m.path?.cwd

/** Write a `data:image/...;base64,` URL to a cache file once; its path, or null. */
function dataUrlToFile(url, partId) {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/s.exec(url)
  if (!m || !partId) return null
  const dir = path.join(os.tmpdir(), 'outpost', 'opencode')
  const file = path.join(dir, `${String(partId).replace(/[^\w-]/g, '')}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`)
  try {
    if (!fs.existsSync(file)) {
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(file, Buffer.from(m[2], 'base64'))
    }
    return file
  } catch {
    return null
  }
}

async function opencodeShow(id) {
  const db = await openOpencode()
  if (!db) return []
  try {
    const messages = db.prepare(`select id, data, time_created from message where session_id = ? order by time_created`).all(id)
    const parts = db.prepare(`select id, message_id, data, time_created from part where session_id = ? order by time_created`).all(id)
    const byMsg = new Map()
    for (const p of parts) {
      if (!byMsg.has(p.message_id)) byMsg.set(p.message_id, [])
      byMsg.get(p.message_id).push(p)
    }
    const items = []
    let open = false
    for (const msg of messages) {
      const m = json(msg.data)
      const t = iso(msg.time_created)
      if (m.path?.cwd) showCwd = m.path.cwd
      if (m.role === 'user') {
        if (open) items.push({ t, kind: 'turn', text: 'Turn finished' })
        items.push({ t, kind: 'turn', text: 'Turn started' })
        open = true
      }
      const userImages = []
      let userEntry = null
      for (const p of byMsg.get(msg.id) ?? []) {
        const d = json(p.data)
        if (m.role === 'user' && d.type === 'file' && String(d.mime ?? '').startsWith('image/')) {
          const src = d.source?.path ?? d.url ?? ''
          if (String(src).startsWith('data:')) {
            // opencode keeps an attached picture inline; write it out once
            const file = dataUrlToFile(src, p.id)
            if (file) userImages.push(file)
          } else userImages.push(absPath(src, s_cwd(m)))
          continue
        }
        const e = opencodePartEntry(d, m.role, iso(p.time_created))
        if (e && e.text !== '') {
          items.push(e)
          if (m.role === 'user' && e.kind === 'user') userEntry = e
        }
      }
      if (userImages.length) {
        if (userEntry) userEntry.images = userImages
        else items.push({ t, kind: 'user', text: '', images: userImages })
      }
      if (m.role === 'assistant' && m.error) {
        items.push({ t: iso(m.time?.completed ?? msg.time_created), kind: 'error', text: m.error.data?.message ?? m.error.name ?? 'Error' })
      }
      if (m.role === 'assistant' && m.time?.completed && open && m.finish && m.finish !== 'tool-calls') {
        items.push({ t: iso(m.time.completed), kind: 'turn', text: 'Turn finished' })
        open = false
      }
    }
    return items
  } finally {
    db.close()
  }
}

// ── GitHub Copilot CLI: ~/.copilot/session-state/<id>/events.jsonl ──────
const copilotRoot = path.join(process.env.COPILOT_HOME ?? path.join(os.homedir(), '.copilot'), 'session-state')

const copilotModel = m => (m ? String(m).split('/').pop() : undefined)

function copilotList(hours) {
  const cutoff = Date.now() - hours * 3_600_000
  let dirs = []
  try {
    dirs = fs.readdirSync(copilotRoot)
  } catch {
    return []
  }
  const files = []
  for (const d of dirs) {
    const file = path.join(copilotRoot, d, 'events.jsonl')
    const stat = statOrNull(file)
    if (stat && stat.mtimeMs >= cutoff) files.push({ file, stat })
  }
  files.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs)
  const out = []
  for (const { file, stat } of files.slice(0, MAX_PER_PROVIDER)) {
    try {
      const { head, all } = headAndTail(file, stat.size)
      const start = head.find(o => o.type === 'session.start')?.data ?? {}
      const firstUser = head.find(o => o.type === 'user.message')?.data
      let model = start.selectedModel
      let state = 'unknown'
      let lastAction
      let lastMessage
      let error
      let tokens
      for (const o of all) {
        const d = o.data ?? {}
        switch (o.type) {
          case 'user.message':
            state = 'running'
            error = undefined
            break
          case 'assistant.turn_start':
            state = 'running'
            break
          case 'assistant.turn_end':
          case 'session.idle':
            state = 'completed'
            break
          case 'session.shutdown':
            if (state === 'running') state = 'completed'
            if (d.currentTokens) tokens = d.currentTokens
            break
          case 'session.error':
            state = 'failed'
            error = d.message
            break
          case 'session.auto_mode_resolved':
            model = d.chosenModel ?? model
            break
          case 'session.model_change':
            model = d.newModel ?? model
            break
          case 'assistant.message':
            if (d.model) model = d.model
            if (d.content) lastMessage = d.content
            break
          case 'tool.execution_start':
            lastAction = SHELL_TOOLS.has(d.toolName) ? `$ ${d.arguments?.command ?? ''}` : d.toolTitle ?? d.toolName
            break
        }
      }
      out.push({
        provider: 'copilot',
        id: start.sessionId ?? path.basename(path.dirname(file)),
        ref: file,
        cwd: start.context?.cwd ?? '',
        model: copilotModel(model),
        title: clip(String(firstUser?.content ?? '').split('\n')[0], 90) || 'Copilot session',
        status: settle(state, stat.mtimeMs),
        lastAction: lastAction ? clip(lastAction, 120) : undefined,
        lastMessage: error ? clip(error, 400) : lastMessage ? clip(lastMessage, 400) : undefined,
        error: error ? clip(error, 300) : undefined,
        tokens,
        startedAt: start.startTime,
        updatedAt: stat.mtimeMs,
      })
    } catch {}
  }
  return out
}

async function copilotShow(file) {
  const items = []
  const byCall = new Map()
  let open = false
  for await (const o of jsonLines(file)) {
    const d = o.data ?? {}
    const t = o.timestamp
    switch (o.type) {
      case 'session.start':
        showCwd = d.context?.cwd ?? ''
        break
      case 'user.message':
        if (open) items.push({ t, kind: 'turn', text: 'Turn finished' })
        items.push({ t, kind: 'turn', text: 'Turn started' })
        {
          const images = (d.attachments ?? [])
            .map(a => a?.path ?? a?.filePath ?? a?.uri)
            .filter(isImagePath)
            .map(a => absPath(a))
          items.push({ t, kind: 'user', text: d.content ?? '', ...(images.length ? { images } : {}) })
        }
        open = true
        break
      case 'assistant.reasoning':
        items.push({ t, kind: 'think', text: String(d.content ?? '').trim() || 'Thinking…' })
        break
      case 'assistant.message':
        if (d.content) items.push({ t, kind: 'agent', text: d.content })
        break
      case 'tool.execution_start': {
        const shell = SHELL_TOOLS.has(d.toolName)
        const e = {
          t,
          kind: shell ? 'cmd' : d.toolName === 'web_fetch' ? 'web' : 'tool',
          text: shell ? d.arguments?.command ?? d.toolTitle ?? d.toolName : `${d.toolName}${d.toolTitle ? `: ${d.toolTitle}` : ''}`,
          status: 'running',
        }
        const target = d.arguments?.path ?? d.arguments?.filePath
        if (isImagePath(target)) e.images = [absPath(target)]
        byCall.set(d.toolCallId, e)
        items.push(e)
        break
      }
      case 'tool.execution_complete': {
        const e = byCall.get(d.toolCallId)
        if (e) {
          if (e.images) e.images = e.images.filter(f => fs.existsSync(f))
          e.status = d.success === false ? 'failed' : 'completed'
          const out = d.error?.message ?? d.result?.content ?? d.result?.detailedContent
          if (out) e.detail = clip(out, 600)
        }
        break
      }
      case 'session.error':
        items.push({ t, kind: 'error', text: d.message ?? 'Error' })
        break
      case 'session.idle':
      case 'session.shutdown':
        if (open) {
          items.push({ t, kind: 'turn', text: 'Turn finished' })
          open = false
        }
        break
    }
  }
  return items
}

// ── Antigravity CLI (agy): logs this mod keeps of `--output-format stream-json`
// agy stores conversations as protobuf; the mod saves the stream of each run
// it starts to ~/.outpost/antigravity/<conversation id>.ndjson, with a
// `mod_user` line for the message it sent (the stream doesn't repeat it).
const agyLogDir = path.join(os.homedir(), '.outpost', 'antigravity')

/** One step per step_index, text deltas joined, last state kept. */
function agySteps(events) {
  const steps = new Map()
  for (const ev of events) {
    const u = ev.step_update
    if (!u) continue
    const key = `${ev._run ?? 0}:${u.step_index}`
    const s = steps.get(key) ?? { ...u, run: ev._run ?? 0, text: '', raw: [] }
    if (u.text_delta) s.text += u.text_delta
    s.state = u.state ?? s.state
    s.step_type = u.step_type ?? s.step_type
    s.usage = u.usage ?? s.usage
    s.raw.push(u)
    s.t = ev._t
    steps.set(key, s)
  }
  return [...steps.values()]
}

/** Every string in a step that names an existing picture file. */
function agyImages(step, cwd) {
  const found = new Set()
  const walk = v => {
    if (typeof v === 'string') {
      if (isImagePath(v)) {
        const f = absPath(v, cwd)
        if (fs.existsSync(f)) found.add(path.normalize(f))
      }
    } else if (v && typeof v === 'object') for (const x of Object.values(v)) walk(x)
  }
  walk(step.raw)
  return [...found].slice(0, 4)
}

/** Read a log: events with the run they belong to (each mod_user starts one). */
function agyRead(file) {
  const events = []
  let run = 0
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue
    let o
    try {
      o = JSON.parse(line)
    } catch {
      continue
    }
    if (o.event === 'mod_user') run++
    o._run = run
    o._t = o.t ?? o._t
    events.push(o)
  }
  return events
}

function agyList(hours) {
  const cutoff = Date.now() - hours * 3_600_000
  let names = []
  try {
    names = fs.readdirSync(agyLogDir).filter(n => n.endsWith('.ndjson'))
  } catch {
    return []
  }
  const out = []
  for (const name of names) {
    const file = path.join(agyLogDir, name)
    const stat = statOrNull(file)
    if (!stat || stat.mtimeMs < cutoff) continue
    try {
      const events = agyRead(file)
      const init = events.find(e => e.event === 'init')
      const users = events.filter(e => e.event === 'mod_user')
      const lastUser = users[users.length - 1]
      const results = events.filter(e => e.event === 'result')
      const lastResult = results[results.length - 1]
      // a run is finished once a result follows its mod_user line
      const finished = lastResult && events.indexOf(lastResult) > events.indexOf(lastUser)
      const ok = finished && /SUCCESS/i.test(lastResult.result?.status ?? '')
      const steps = agySteps(events)
      const lastStep = [...steps].reverse().find(s => s.step_type !== 'user_input')
      let tokens = 0
      for (const r of results) tokens += r.result?.usage?.total_tokens ?? 0
      out.push({
        provider: 'antigravity',
        id: path.basename(name, '.ndjson'),
        ref: file,
        cwd: init?.init?.cwd ?? lastUser?.cwd ?? '',
        originator: 'outpost',
        model: lastUser?.model ?? init?.init?.model,
        title: clip(String(users[0]?.text ?? '').split('\n')[0], 90) || 'Antigravity session',
        status: settle(finished ? (ok ? 'completed' : 'failed') : 'running', stat.mtimeMs),
        lastAction: lastStep ? clip(lastStep.step_type === 'agent_response' ? lastStep.text : lastStep.step_type, 120) : undefined,
        lastMessage: finished ? clip(lastResult.result?.response ?? lastResult.result?.error ?? '', 400) || undefined : undefined,
        error: finished && !ok ? clip(lastResult.result?.error ?? lastResult.result?.status, 300) : undefined,
        tokens: tokens || undefined,
        startedAt: users[0]?.t,
        updatedAt: stat.mtimeMs,
      })
    } catch {}
  }
  return out.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_PER_PROVIDER)
}

async function agyShow(file) {
  const events = agyRead(file)
  const cwd = events.find(e => e.event === 'init')?.init?.cwd ?? ''
  showCwd = cwd
  const steps = agySteps(events)
  const items = []
  let run = 0
  for (const ev of events) {
    if (ev.event === 'mod_user') {
      if (run > 0) items.push({ t: ev.t, kind: 'turn', text: 'Turn finished' })
      run = ev._run
      items.push({ t: ev.t, kind: 'turn', text: 'Turn started' })
      items.push({ t: ev.t, kind: 'user', text: ev.text ?? '', ...(ev.images?.length ? { images: ev.images } : {}) })
      for (const s of steps) {
        if (s.run !== run) continue
        const t = s.t ?? ev.t
        const images = agyImages(s, cwd)
        const extra = images.length ? { images } : {}
        const type = String(s.step_type ?? '')
        const failed = /ERROR|FAIL|CANCEL/i.test(s.state ?? '')
        if (type === 'user_input' || type === 'system_message') continue
        if (type === 'agent_response' && !s.text.trim() && !images.length) continue // agy's empty steps between tools
        // the latest update that names the tool: { tool_name, tool_info: { name, parameters, output } }
        const info = [...s.raw].reverse().find(r => r.tool_info || r.tool_name) ?? {}
        const tool = info.tool_info?.name ?? info.tool_name ?? ''
        const params = info.tool_info?.parameters ?? {}
        const output = info.tool_info?.output
        const status = failed ? 'failed' : /ACTIVE|RUNNING|PENDING/i.test(s.state ?? '') ? 'running' : 'completed'
        if (type === 'agent_response') items.push({ t, kind: 'agent', text: s.text.trim(), ...extra })
        else if (/think|plan/i.test(type)) items.push({ t, kind: 'think', text: s.text.trim() || 'Thinking…' })
        else if (/image/i.test(type)) items.push({ t, kind: 'image', text: s.text.trim() || 'Generated image', ...extra })
        else if (type === 'subagent') {
          const roles = (info.subagent_info?.subagents ?? []).map(a => a.role ?? a.type_name).filter(Boolean)
          items.push({ t, kind: 'tool', text: `subagent: ${roles.join(', ') || 'started'}`, status, ...extra })
        } else if (/run_command|command|terminal|shell/i.test(tool || type)) {
          const cmd = params.CommandLine ?? params.command ?? params.Command ?? s.raw.map(r => r.command ?? r.command_line).find(Boolean)
          items.push({ t, kind: 'cmd', text: cmd ?? tool ?? type, status, detail: output ? clip(output, 600) : undefined, ...extra })
        } else {
          // the first short string parameter is usually the target (a path, a query, an action)
          const target = Object.values(params).find(v => typeof v === 'string' && v.length < 200)
          const name = tool || type
          items.push({
            t,
            kind: /search|browse|url|fetch/i.test(name) ? 'web' : 'tool',
            text: `${name}${target ? `: ${target}` : s.text.trim() ? `: ${clip(s.text, 120)}` : ''}`,
            status,
            detail: failed && output ? clip(output, 300) : undefined,
            ...extra,
          })
        }
      }
    } else if (ev.event === 'result' && !/SUCCESS/i.test(ev.result?.status ?? '')) {
      items.push({ t: ev.t, kind: 'error', text: ev.result?.error ?? ev.result?.status ?? 'Error' })
    }
  }
  const last = events[events.length - 1]
  if (last?.event === 'result') items.push({ t: last.t, kind: 'turn', text: 'Turn finished' })
  return items
}

// ── where: argv that starts a provider's CLI without a shell ────────────
// npm's .cmd shims can't be spawned directly on Windows, so find the real
// entry: a JS file run with this node, or the package's own executable.
const CANDIDATES = {
  codex: dir => [
    { js: path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js') },
    { bin: path.join(dir, process.platform === 'win32' ? 'codex.exe' : 'codex') },
  ],
  opencode: dir => [
    { bin: path.join(dir, 'node_modules', 'opencode-ai', 'bin', process.platform === 'win32' ? 'opencode.exe' : 'opencode') },
    { bin: path.join(dir, process.platform === 'win32' ? 'opencode.exe' : 'opencode') },
  ],
  copilot: dir => [{ bin: path.join(dir, process.platform === 'win32' ? 'copilot.exe' : 'copilot') }],
  antigravity: dir => [{ bin: path.join(dir, process.platform === 'win32' ? 'agy.exe' : 'agy') }],
}
// default install places, for a PATH that predates the install
const KNOWN = {
  antigravity: [path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe'), path.join(os.homedir(), '.local', 'bin', 'agy')],
}

function where(provider) {
  const make = CANDIDATES[provider]
  if (!make) return null
  for (const known of KNOWN[provider] ?? []) if (fs.existsSync(known)) return [known]
  for (const dir of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!dir) continue
    for (const c of make(dir)) {
      if (c.js && fs.existsSync(c.js)) return [process.execPath, c.js]
      if (c.bin && fs.existsSync(c.bin) && fs.statSync(c.bin).isFile()) return [c.bin]
    }
  }
  return null
}

/**
 * Within each turn, the agent's last message is its reply and earlier ones
 * are progress notes. Codex says so itself (`phase`); the others don't.
 */
function markReplies(items) {
  let lastInTurn = -1
  const flush = () => {
    if (lastInTurn >= 0) items[lastInTurn].kind = 'agent'
    lastInTurn = -1
  }
  items.forEach((e, i) => {
    if (e.kind === 'turn' && e.text === 'Turn started') flush()
    if (e.kind === 'agent' || e.kind === 'note') {
      e.kind = 'note'
      lastInTurn = i
    }
  })
  flush()
  return items
}

// ── models: what each provider can run, for the band's model picker ──────

function runLines(argv, timeout = 25_000) {
  try {
    return execFileSync(argv[0], [...argv.slice(1)], { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

async function listModels() {
  const uniq = xs => [...new Set(xs.filter(Boolean))]
  // Codex keeps the list its server sent in models_cache.json
  let codex = []
  try {
    const cache = JSON.parse(fs.readFileSync(path.join(process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex'), 'models_cache.json'), 'utf8'))
    codex = (cache.models ?? []).map(m => m.slug ?? m.id).filter(m => m && !/auto-review/.test(m))
  } catch {}
  // opencode lists hundreds (ids may hold several slashes): the ones used lately first
  const oc = where('opencode')
  const ocAll = oc ? runLines([...oc, 'models']).filter(l => /^[^\s/]+\/\S+$/.test(l)) : []
  const ocUsed = (await opencodeList(24 * 60)).map(s => s.model).filter(m => m && m.includes('/'))
  const opencode = uniq([...ocUsed, ...ocAll]).slice(0, 500)
  // Copilot has no list command: 'auto' plus every model its sessions used
  const copilot = uniq(['auto', ...copilotList(24 * 60).map(s => s.model)])
  // agy models prints "<id>\t<name>" after a "Fetching…" line
  const agy = where('antigravity')
  const antigravity = agy ? runLines([...agy, 'models']).filter(l => l.includes('\t')).map(l => l.split('\t')[0]) : []
  return { codex: uniq(codex), opencode, copilot, antigravity }
}

// ── main ─────────────────────────────────────────────────────────────────
const SHOW = { codex: codexShow, opencode: opencodeShow, copilot: copilotShow, antigravity: agyShow }

async function main() {
  const [cmd, a, b] = process.argv.slice(2)
  if (cmd === 'list') {
    const hours = Number(a) || 12
    const results = await Promise.allSettled([codexList(hours), opencodeList(hours), copilotList(hours), agyList(hours)])
    const sessions = results.flatMap(r => (r.status === 'fulfilled' ? r.value : []))
    const errors = results.flatMap((r, i) => (r.status === 'rejected' ? [`${['codex', 'opencode', 'copilot', 'antigravity'][i]}: ${r.reason?.message ?? r.reason}`] : []))
    process.stdout.write(JSON.stringify({ sessions, errors }))
  } else if (cmd === 'show') {
    const show = SHOW[a]
    if (!show) throw new Error(`unknown provider ${a}`)
    const raw = (await show(b)).filter(Boolean)
    const items = attachMentionedImages(a === 'codex' ? raw : markReplies(raw), showCwd)
    // Long texts are cut so one step can't swamp the pane; thinking keeps
    // far more, since it only shows when its row is opened.
    for (const e of items) {
      const cap = e.kind === 'think' ? 20_000 : 4_000
      if (e.text && e.text.length > cap) e.text = e.text.slice(0, cap - 1) + '…'
    }
    process.stdout.write(JSON.stringify(items.slice(-150)))
  } else if (cmd === 'models') {
    process.stdout.write(JSON.stringify(await listModels()))
  } else if (cmd === 'logdir') {
    process.stdout.write(JSON.stringify({ antigravity: agyLogDir }))
  } else if (cmd === 'where') {
    process.stdout.write(JSON.stringify({ argv: where(a) }))
  } else {
    process.stderr.write('usage: agents-scan.mjs list <hours> | show <provider> <ref> | where <provider>\n')
    process.exit(2)
  }
}

main().catch(err => {
  process.stderr.write(String(err?.stack ?? err))
  process.exit(1)
})
