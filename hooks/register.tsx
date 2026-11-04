import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type {
  Claim,
  ClaudeAgent,
  ExternalProvider,
  ExternalSession as CodexSession,
  RosterStatus,
  Selection,
  TalkState,
  Thumb,
  TimelineItem,
} from '../types'

// ── State ────────────────────────────────────────────────────────────────
// Change a `shape` tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const PANE = 'agents'
const TITLE = 'Outpost'

const codexA = atom({ plugin: 'outpost', key: 'codex' } as const, [] as CodexSession[], { shape: 'ext-1' })
const claudeA = atom({ plugin: 'outpost', key: 'claude' } as const, [] as ClaudeAgent[], { shape: 'claude-2' })
type ClaudeMeta = Pick<ClaudeAgent, 'model' | 'answer' | 'tokens' | 'endedAt'>
const claudeMetaA = atom({ plugin: 'outpost', key: 'claudeMeta' } as const, {} as Record<string, ClaudeMeta>, { shape: 'cmeta-1' })
const talkA = atom(
  { plugin: 'outpost', key: 'talk' } as const,
  { provider: 'claude', models: {}, sessions: {}, shared: false, autoApprove: false } as TalkState,
  { shape: 'talk-1' },
)
const installedA = atom({ plugin: 'outpost', key: 'installed' } as const, {} as Record<string, boolean>, { shape: 'installed-1' })
const modelListsA = atom({ plugin: 'outpost', key: 'modelLists' } as const, {} as Record<string, string[]>, { shape: 'models-1' })
const selectedA = atom({ plugin: 'outpost', key: 'selected' } as const, null as Selection, { shape: 'sel-1' })
const timelineA = atom({ plugin: 'outpost', key: 'timeline' } as const, [] as TimelineItem[], { shape: 'tl-1' })
const logosA = atom({ plugin: 'outpost', key: 'logos' } as const, {} as Record<string, string>, { shape: 'logos-1' })
const mascotsA = atom({ plugin: 'outpost', key: 'mascots' } as const, {} as Record<string, string>, { shape: 'mascots-1' })
const picksA = atom({ plugin: 'outpost', key: 'mascotPicks' } as const, {} as Record<string, string>, { shape: 'picks-1' })
const avatarsA = atom({ plugin: 'outpost', key: 'avatars' } as const, {} as Record<string, string>, { shape: 'av-1' })
const namesA = atom({ plugin: 'outpost', key: 'names' } as const, {} as Record<string, string>, { shape: 'names-1' })
const busyA = atom({ plugin: 'outpost', key: 'busy' } as const, {} as Record<string, boolean>, { shape: 'busy-1' })
const errorA = atom({ plugin: 'outpost', key: 'error' } as const, '', { shape: 'err-1' })
const startedA = atom({ plugin: 'outpost', key: 'started' } as const, 0, { shape: 'started-1' })
const ownedA = atom({ plugin: 'outpost', key: 'owned' } as const, {} as Record<string, boolean>, { shape: 'owned-1' })
const seenA = atom({ plugin: 'outpost', key: 'seen' } as const, {} as Record<string, number>, { shape: 'seen-1' })
const failedA = atom({ plugin: 'outpost', key: 'failed' } as const, {} as Record<string, string>, { shape: 'failed-1' })
const hiddenA = atom({ plugin: 'outpost', key: 'hidden' } as const, {} as Record<string, boolean>, { shape: 'hidden-1' })
const togglesA = atom({ plugin: 'outpost', key: 'toggles' } as const, {} as Record<string, boolean>, { shape: 'toggles-1' })
const draftsA = atom({ plugin: 'outpost', key: 'drafts' } as const, {} as Record<string, string>, { shape: 'drafts-1' })
const thumbsA = atom({ plugin: 'outpost', key: 'thumbs' } as const, {} as Record<string, Thumb>, { shape: 'thumbs-1' })
const attachA = atom({ plugin: 'outpost', key: 'attachments' } as const, {} as Record<string, string[]>, { shape: 'attach-1' })
const claimsA = atom({ plugin: 'outpost', key: 'claims' } as const, [] as Claim[], { shape: 'claims-1' })

type Dollar = Parameters<Parameters<Register>[0]>[2] extends ($: infer D, ...rest: never[]) => unknown ? D : never

// Each provider's own site icon, the mark browsers show for it: fetched
// once, fitted onto a square and cached in this mod's settings. The second
// address is a fallback; openai.com refuses scripted requests.
const LOGO_SOURCES: Record<string, string[]> = {
  claude: ['https://claude.ai/favicon.ico', 'https://www.anthropic.com/favicon.ico'],
  codex: ['https://chatgpt.com/favicon.ico', 'https://openai.com/favicon.ico'],
  opencode: ['https://opencode.ai/apple-touch-icon.png', 'https://opencode.ai/favicon.ico'],
  copilot: ['https://github.com/fluidicon.png', 'https://github.githubassets.com/favicons/favicon.png'],
  antigravity: ['https://antigravity.google/favicon.ico'],
}

// ── Look ─────────────────────────────────────────────────────────────────
const C = {
  run: '#58a6ff',
  ok: '#3fb950',
  warn: '#d29922',
  bad: '#f85149',
  dim: '#8b949e',
  unread: '#a371f7',
  claude: '#D97757',
  codex: '#10a37f',
  opencode: '#e3a008',
  copilot: '#8b8cf8',
  antigravity: '#5b9cff',
  userBubble: '#1f6feb33',
  userBorder: '#1f6feb',
  agentBorder: '#2ea04366',
  noteBubble: '#ffffff0d',
  attention: '#f8514914',
}

const PROVIDER = {
  claude: { label: 'Claude', color: C.claude },
  codex: { label: 'Codex', color: C.codex },
  opencode: { label: 'opencode', color: C.opencode },
  copilot: { label: 'Copilot', color: C.copilot },
  antigravity: { label: 'Antigravity', color: C.antigravity },
} as const
type ProviderKey = keyof typeof PROVIDER

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function hue(name: string): number {
  let h = 0
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Small icons, drawn here (no third-party logos).
const ICON = {
  spinner: (c: string) =>
    `<circle cx="12" cy="12" r="8" fill="none" stroke="${c}" stroke-width="2.4" stroke-dasharray="3 3.3" stroke-linecap="round"/>`,
  mail: (c: string) =>
    `<rect x="4" y="6.5" width="16" height="11" rx="2" fill="none" stroke="${c}" stroke-width="2"/><path d="M5 8l7 5 7-5" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/>`,
  alert: (c: string) =>
    `<path d="M12 4l9 15.5H3z" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round"/><path d="M12 10v4.2" stroke="${c}" stroke-width="2.2" stroke-linecap="round"/><circle cx="12" cy="17" r="1.2" fill="${c}"/>`,
  check: (c: string) =>
    `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${c}" stroke-width="2"/><path d="M8 12.3l2.7 2.7L16.2 9.4" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  play: (c: string) => `<circle cx="12" cy="12" r="9" fill="${c}" opacity=".18"/><path d="M10 8l6 4-6 4z" fill="${c}"/>`,
  // provider marks, drawn here: a sparkle (Claude), a prompt (Codex),
  // braces (opencode), goggles (Copilot)
  claude: (c: string) => `<path d="M12 3l2 6.2L20 12l-6 2.8L12 21l-2-6.2L4 12l6-2.8z" fill="${c}"/>`,
  codex: (c: string) =>
    `<rect x="3.5" y="5" width="17" height="14" rx="3" fill="none" stroke="${c}" stroke-width="2"/><path d="M7.5 10l3 2.2-3 2.2M12.5 15h4" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  opencode: (c: string) =>
    `<path d="M9 5C6.5 5 7 9 5 12c2 3 1.5 7 4 7M15 5c2.5 0 2 4 4 7-2 3-1.5 7-4 7" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  copilot: (c: string) =>
    `<circle cx="8" cy="12" r="3.6" fill="none" stroke="${c}" stroke-width="2"/><circle cx="16" cy="12" r="3.6" fill="none" stroke="${c}" stroke-width="2"/><path d="M11.6 12h.8M3 11l1.4-3M21 11l-1.4-3" stroke="${c}" stroke-width="2" stroke-linecap="round"/>`,
  // an arch, for Antigravity
  antigravity: (c: string) =>
    `<path d="M4 20C7 13 9 5 12 5s5 8 8 15" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>`
}
const iconSvg = (body: string, size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">${body}</svg>`

function avatarSvg(name: string, png: string | undefined, size: number): string {
  const rx = Math.round(size * 0.22)
  const inner = png
    ? `<defs><clipPath id="c"><rect width="${size}" height="${size}" rx="${rx}"/></clipPath></defs>` +
      `<image href="data:image/png;base64,${png}" width="${size}" height="${size}" clip-path="url(#c)" preserveAspectRatio="xMidYMid slice"/>`
    : `<rect width="${size}" height="${size}" rx="${rx}" fill="hsl(${hue(name)},42%,36%)"/>` +
      `<text x="50%" y="50%" dy="0.36em" text-anchor="middle" font-family="system-ui,sans-serif" font-weight="600" font-size="${Math.round(size * 0.44)}" fill="#fff">${esc((name.trim()[0] ?? '?').toUpperCase())}</text>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${inner}` +
    `<rect x="0.5" y="0.5" width="${size - 1}" height="${size - 1}" rx="${rx}" fill="none" stroke="#ffffff22"/></svg>`
  )
}

// A pill: optional icon + label, measured roughly from the text length.
export function pillSvg(
  label: string,
  color: string,
  icon?: string,
  filled = false,
  logoPng?: string,
): { source: string; width: number } {
  const h = 22
  const textW = Math.round(label.length * 6.6)
  const iconW = icon || logoPng ? 18 : 0
  const w = 16 + iconW + textW
  const source =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="${h / 2}" fill="${filled ? color + '26' : '#ffffff0a'}" stroke="${color}${filled ? '' : '66'}"/>` +
    (logoPng
      ? `<image href="data:image/png;base64,${logoPng}" x="7" y="3" width="16" height="16"/>`
      : icon
        ? `<svg x="7" y="3" width="16" height="16" viewBox="0 0 24 24">${icon}</svg>`
        : '') +
    `<text x="${8 + iconW}" y="15" font-family="system-ui,sans-serif" font-size="11.5" font-weight="500" fill="${color}">${esc(label)}</text></svg>`
  return { source, width: w }
}

type StatusView = { label: string; color: string; icon: (c: string) => string }
function statusView(status: RosterStatus, opts: { busy?: boolean; failed?: boolean }): StatusView {
  if (opts.failed) return { label: 'Failed', color: C.bad, icon: ICON.alert }
  if (opts.busy) return { label: 'Running', color: C.run, icon: ICON.spinner }
  switch (status) {
    case 'running':
    case 'pending':
      return { label: 'Running', color: C.run, icon: ICON.spinner }
    case 'waiting':
      return { label: 'Waiting', color: C.warn, icon: ICON.mail }
    case 'stalled':
      return { label: 'Stalled', color: C.warn, icon: ICON.alert }
    case 'failed':
    case 'killed':
      return { label: status === 'killed' ? 'Stopped' : 'Failed', color: C.bad, icon: ICON.alert }
    case 'idle':
      return { label: 'Idle', color: C.dim, icon: ICON.check }
    default:
      return { label: 'Completed', color: C.ok, icon: ICON.check }
  }
}

const nameKey = (name: string) => name.toLowerCase().trim()

function avatarFor(avatars: Record<string, string>, name: string): string | undefined {
  const lower = name.toLowerCase().trim()
  if (avatars[lower]) return avatars[lower]
  const first = lower.split(/[\s\-_:@./]+/)[0]
  return first ? avatars[first] : undefined
}

function ago(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  if (s < 86400) return `${Math.round(s / 3600)}h ago`
  return `${Math.round(s / 86400)}d ago`
}

function clock(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const h = d.getHours()
  return `${((h + 11) % 12) + 1}:${String(d.getMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const shortPath = (p: string) => {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts.length > 3 ? `${parts[0]}\\…\\${parts[parts.length - 1]}` : p
}

const oneLine = (s: string) => s.replace(/\s+/g, ' ').trim()

// A one-line preview of a Markdown reply: links keep their text, marks go.
const plainPreview = (s: string) =>
  oneLine(
    s
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/(\*\*|__|\*|_)(\S[^*_]*?\S|\S)\1/g, '$2')
      .replace(/^[-*>#\s]+/gm, ''),
  )

function agentName(s: CodexSession, names: Record<string, string>): string {
  return names[s.id] ?? `${PROVIDER[s.provider].label} ${s.id.slice(-4)}`
}

async function runJson<T>($: Dollar, argv: string[], timeoutMs = 20_000): Promise<T> {
  const ran = await $.process.run(argv, { timeoutMs })
  if (ran.exitCode !== 0) throw new Error((ran.stderr || ran.stdout || `exit ${ran.exitCode}`).slice(0, 300))
  return JSON.parse(ran.stdout) as T
}

// A shell command that starts one of these CLIs (see the claim hook).
const CLI_PATTERN: Record<ExternalProvider, RegExp> = {
  codex: /\bcodex(?:\.exe|\.cmd)?\s+(?:exec|e)\b/i,
  opencode: /\bopencode(?:\.exe|\.cmd)?\s+run\b/i,
  copilot: /\bcopilot(?:\.exe|\.cmd)?\b[^\n]*\s(?:-p|--prompt|-i)\b/i,
  antigravity: /\bagy(?:\.exe)?\b[^\n]*\s(?:-p|--print|--prompt)\b/i,
}

const scanner = ($: Dollar) => `${$.plugin.root}/scripts/agents-scan.mjs`

/** Record what engine events say about a Claude agent; kept per session. */
async function saveMeta($: Dollar, id: string, patch: ClaudeMeta) {
  await update($, claudeMetaA, m => ({ ...m, [id]: { ...m[id], ...patch } }))
  await $.store.set(`claude-meta:${await $.session.id()}`, await read($, claudeMetaA))
}

// ── Logos and mascots ─────────────────────────────────────────────────────
/** Fetch the site icon of each provider that has no cached logo yet. */
async function fetchMissingLogos($: Dollar) {
  const have = await read($, logosA)
  for (const [provider, urls] of Object.entries(LOGO_SOURCES)) {
    if (have[provider]) continue
    for (const url of urls) {
      try {
        const py = await findPython($)
        if (!py) return
        const ran = await $.process.run([...py, '-I', `${$.plugin.root}/scripts/avatar.py`, '--fit', url], { timeoutMs: 30_000 })
        if (ran.exitCode !== 0 || !ran.stdout.trim()) continue
        const png = ran.stdout.trim()
        await update($, logosA, l => ({ ...l, [provider]: png }))
        await $.store.set('logos', await read($, logosA))
        break
      } catch {}
    }
  }
}

/** Load the bundled mascots (assets/mascots/*.png) into state, once a load. */
async function loadMascots($: Dollar) {
  const dir = `${$.plugin.root}/assets/mascots`
  const files = (await $.fs.list(dir)).filter(f => f.kind === 'file' && /\.png$/i.test(f.name))
  const loaded: Record<string, string> = {}
  for (const f of files) {
    try {
      const { base64 } = (await $.fs.read(`${dir}/${f.name}`, { as: 'bytes' })) as { base64: string }
      loaded[f.name] = base64
    } catch {}
  }
  await update($, mascotsA, () => loaded)
}

/**
 * Give every agent name without one a mascot: the least-used one, picked at
 * random among ties, kept across sessions so an agent keeps its face.
 */
async function assignMascots($: Dollar, agentNames: string[]) {
  const [mascots, picks] = await Promise.all([read($, mascotsA), read($, picksA)])
  const files = Object.keys(mascots)
  const fresh = [...new Set(agentNames.map(nameKey))].filter(n => n && !(picks[n] && mascots[picks[n] as string]))
  if (!files.length || !fresh.length) return
  const next = { ...picks }
  const uses = new Map(files.map(f => [f, 0]))
  for (const f of Object.values(next)) if (uses.has(f)) uses.set(f, (uses.get(f) ?? 0) + 1)
  for (const n of fresh) {
    const least = Math.min(...uses.values())
    const pool = files.filter(f => uses.get(f) === least)
    const pick = pool[Math.floor(Math.random() * pool.length)] ?? files[0] ?? ''
    next[n] = pick
    uses.set(pick, (uses.get(pick) ?? 0) + 1)
  }
  await update($, picksA, () => next)
  await $.store.set('mascotPicks', next)
}

// ── Which external sessions belong to this Claude session ────────────────
// Never decided by a log's modified time: opening an old chat in a
// provider's own app rewrites it. A session belongs here when this mod
// started it, when Codex records Claude Code as its originator and it
// started after this Claude session did, or when it started while a
// Bash/PowerShell command here was running that provider's CLI.
function belongsHere(s: CodexSession, owned: Record<string, boolean>, started: number, claims: Claim[]): boolean {
  if (owned[s.id]) return true
  const at = s.startedAt ? Date.parse(s.startedAt) : Number.NaN
  if (Number.isNaN(at) || at < started - 5_000) return false
  if (s.provider === 'codex' && s.originator === 'Claude Code') return true
  return claims.some(c => c.provider === s.provider && at >= c.from && at <= c.to)
}

async function persistOwned($: Dollar) {
  const id = await $.session.id()
  await $.store.set(`owned:${id}`, await read($, ownedA))
}

// ── External agents: refresh, start, send ───────────────────────────────
const cliArgv: Partial<Record<ExternalProvider, string[]>> = {}
let refreshing = false

async function findCli($: Dollar, provider: ExternalProvider): Promise<string[]> {
  const cached = cliArgv[provider]
  if (cached) return cached
  const { argv } = await runJson<{ argv: string[] | null }>($, ['node', scanner($), 'where', provider])
  if (!argv) throw new Error(`${PROVIDER[provider].label} CLI not found on PATH`)
  cliArgv[provider] = argv
  return argv
}

async function refreshTimeline($: Dollar, s: CodexSession) {
  const items = await runJson<TimelineItem[]>($, ['node', scanner($), 'show', s.provider, s.ref])
  await update($, timelineA, () => items)
  void ensureThumbs($, items.flatMap(i => i.images ?? []).slice(-12))
}

// ── Pictures: previews, opening, attaching ──────────────────────────────
const THUMB_WIDTH = 420
const THUMB_KEEP = 24 // previews kept in state, newest last

/** Make previews for any of `paths` that has none yet (scripts/thumb.py). */
async function ensureThumbs($: Dollar, paths: string[]) {
  const have = await read($, thumbsA)
  const missing = [...new Set(paths)].filter(p => p && !have[p]).slice(0, 12)
  if (!missing.length) return
  try {
    const got = await runJson<Record<string, Thumb>>(
      $,
      [...(await findPython($, true)), '-I', `${$.plugin.root}/scripts/thumb.py`, String(THUMB_WIDTH), ...missing],
      60_000,
    )
    await update($, thumbsA, t => {
      const next: Record<string, Thumb> = { ...t, ...got }
      const keys = Object.keys(next)
      for (const k of keys.slice(0, Math.max(0, keys.length - THUMB_KEEP))) delete next[k]
      return next
    })
  } catch (err) {
    const why = String((err as Error).message ?? err).slice(0, 160)
    await update($, thumbsA, t => ({ ...t, ...Object.fromEntries(missing.map(p => [p, { error: why }])) }))
  }
}

const fileName = (f: string) => f.split(/[\\/]/).pop() ?? f

/** Open a picture in the system's default viewer. */
async function openFile($: Dollar, file: string) {
  const isWindows = /^[A-Za-z]:[\\/]/.test(file)
  const tries = isWindows ? [['explorer.exe', file.replace(/\//g, '\\')]] : [['open', file], ['xdg-open', file]]
  for (const argv of tries) {
    try {
      // explorer.exe exits 1 even when it opened the file
      await $.process.run(argv, { timeoutMs: 10_000 })
      return
    } catch {}
  }
  $.ui.toast(`Couldn't open ${fileName(file)}`)
}

// Windows PowerShell snippets (STA, for the clipboard and dialogs). Each
// prints one picture path per line.
const PASTE_PS = String.raw`
Add-Type -AssemblyName System.Windows.Forms, System.Drawing
$dir = Join-Path $env:TEMP 'outpost'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
if ([System.Windows.Forms.Clipboard]::ContainsImage()) {
  $img = [System.Windows.Forms.Clipboard]::GetImage()
  $p = Join-Path $dir ('paste-' + [DateTime]::Now.ToString('yyyyMMdd-HHmmss-fff') + '.png')
  $img.Save($p, [System.Drawing.Imaging.ImageFormat]::Png)
  Write-Output $p
} elseif ([System.Windows.Forms.Clipboard]::ContainsFileDropList()) {
  [System.Windows.Forms.Clipboard]::GetFileDropList() | Where-Object { $_ -match '\.(png|jpe?g|webp|gif|bmp)$' } | ForEach-Object { Write-Output $_ }
}
`
const PICK_PS = String.raw`
Add-Type -AssemblyName System.Windows.Forms
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$d = New-Object System.Windows.Forms.OpenFileDialog
$d.Title = 'Attach images'
$d.Filter = 'Images|*.png;*.jpg;*.jpeg;*.webp;*.gif;*.bmp|All files|*.*'
$d.Multiselect = $true
if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { $d.FileNames | ForEach-Object { Write-Output $_ } }
$owner.Dispose()
`

async function runPowerShell($: Dollar, script: string, timeoutMs: number): Promise<string[]> {
  const ran = await $.process.run(['powershell.exe', '-NoProfile', '-STA', '-Command', script], { timeoutMs })
  if (ran.exitCode !== 0) throw new Error((ran.stderr || `exit ${ran.exitCode}`).slice(0, 200))
  return ran.stdout
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
}

async function addAttachments($: Dollar, sessionId: string, paths: string[]) {
  if (!paths.length) return
  await update($, attachA, m => ({ ...m, [sessionId]: [...new Set([...(m[sessionId] ?? []), ...paths])].slice(-8) }))
  void ensureThumbs($, paths)
}

async function pasteImage($: Dollar, sessionId: string) {
  try {
    const paths = await runPowerShell($, PASTE_PS, 20_000)
    if (!paths.length) $.ui.toast('No image on the clipboard')
    await addAttachments($, sessionId, paths)
  } catch (err) {
    $.ui.toast(`Couldn't read the clipboard: ${String((err as Error).message ?? err).slice(0, 120)}`)
  }
}

async function pickImages($: Dollar, sessionId: string) {
  try {
    await addAttachments($, sessionId, await runPowerShell($, PICK_PS, 600_000))
  } catch (err) {
    $.ui.toast(`Couldn't open the file picker: ${String((err as Error).message ?? err).slice(0, 120)}`)
  }
}

/** `--flag path` once per picture: each CLI's own way to attach. */
const imageFlags = (flag: string, images: string[] = []) => images.flatMap(p => [flag, p])


async function refresh($: Dollar) {
  if (refreshing) return
  refreshing = true
  try {
    const started = (await read($, startedA)) || Date.now()
    const hours = Math.min(96, Math.ceil((Date.now() - started) / 3_600_000) + 2)
    const [scan, agents, owned, claims] = await Promise.all([
      runJson<{ sessions: CodexSession[]; errors: string[] }>($, ['node', scanner($), 'list', String(hours)]),
      $.agent.list(),
      read($, ownedA),
      read($, claimsA),
    ])
    const external = scan.sessions.filter(s => belongsHere(s, owned, started, claims))
    const names = await read($, namesA)
    const before = await read($, codexA)
    await update($, codexA, () => external)
    // $.agent.list() drops a subagent soon after it finishes, so keep every
    // agent seen this session; one that left the list is finished.
    const [prevClaude, meta] = await Promise.all([read($, claudeA), read($, claudeMetaA)])
    const live = new Map(agents.map(a => [a.id, a]))
    const merged: ClaudeAgent[] = [
      ...agents.map(a => ({
        id: a.id,
        name: a.name,
        description: a.description,
        type: a.type,
        status: a.status as RosterStatus,
        parentId: a.parentId,
        ...meta[a.id],
      })),
      ...prevClaude
        .filter(p => !live.has(p.id))
        .map(p => ({
          ...p,
          ...meta[p.id],
          status: (['running', 'pending', 'waiting'].includes(p.status) ? 'completed' : p.status) as RosterStatus,
        })),
    ]
    if (JSON.stringify(merged) !== JSON.stringify(prevClaude)) {
      await update($, claudeA, () => merged)
      await $.store.set(`claude:${await $.session.id()}`, merged.slice(-60))
    }
    const sel = await read($, selectedA)
    if (sel && sel.provider !== 'claude') {
      const now = external.find(s => s.id === sel.id)
      const was = before.find(s => s.id === sel.id)
      // A run's last write can land while a tick is already reading, leaving
      // the mtime unchanged on the next one; so a session that is working, or
      // finished in the last minute, is re-read every tick.
      const recent = now !== undefined && Date.now() - now.updatedAt < 60_000
      const working = now !== undefined && (now.status === 'running' || (await read($, busyA))[now.id] === true)
      if (now && (now.updatedAt !== was?.updatedAt || working || recent)) {
        await refreshTimeline($, now)
        // follow along while it works; a finished session stays where you are
        if (now.status === 'running' || (await read($, busyA))[now.id]) void jumpToNewest($)
      }
    }
    await assignMascots($, [
      ...agents.map(a => a.name ?? a.description),
      ...external.map(x => agentName(x, names)),
    ])
    await update($, errorA, () => scan.errors.join('; '))
  } catch (err) {
    await update($, errorA, () => String((err as Error).message ?? err))
  } finally {
    refreshing = false
  }
}

// Codex prints thread_id, opencode sessionID ("ses_…"); Copilot's id is ours.
const SESSION_ID = /"(?:thread_id|session_id|conversation_id|sessionID|sessionId)"\s*:\s*"(ses_[A-Za-z0-9]+|[0-9a-f-]{36})"/

/**
 * Runs one agent turn in the background. Resolves with the session id as
 * soon as the CLI prints it (or null after 30 s), and calls `onEnd` with the
 * error text, if any, when the process ends.
 */
function runAgent(
  $: Dollar,
  argv: string[],
  input: string | undefined,
  cwd: string | undefined,
  onEnd: (last: string | undefined, code: number | null) => void,
  log?: AgentLog,
): Promise<string | null> {
  return new Promise(resolve => {
    let resolved = false
    const settleId = (id: string | null) => {
      if (!resolved) {
        resolved = true
        resolve(id)
      }
    }
    void (async () => {
      let last: string | undefined
      let code: number | null = null
      let buffer = ''
      let stderr = ''
      // Antigravity: its own store is protobuf, so keep the stream as the log
      const logged: string[] = log ? [JSON.stringify(log.user)] : []
      let logFile: string | null = null
      let prior = ''
      const openLog = async (id: string) => {
        logFile = `${await agyLogDir($)}/${id}.ndjson`
        try {
          prior = String(await $.fs.read(logFile))
          if (prior && !prior.endsWith('\n')) prior += '\n'
        } catch {
          prior = ''
        }
      }
      const flushLog = async () => {
        if (logFile) await $.fs.write(logFile, prior + logged.join('\n') + '\n').catch(() => undefined)
      }
      if (log?.id) {
        await openLog(log.id)
        await flushLog()
      }
      try {
        const child = $.process.spawn({ argv, cwd, input })
        for await (const { stream, text } of child) {
          if (stream !== 'stdout') {
            stderr = (stderr + text).slice(-2000)
            continue
          }
          buffer += text
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            const id = SESSION_ID.exec(line)?.[1]
            if (id) settleId(id)
            if (log && line.trim()) {
              logged.push(line.trim())
              if (!logFile && id) await openLog(id)
              await flushLog()
            }
            try {
              const ev = JSON.parse(line) as {
                type?: string
                message?: string
                error?: { message?: string; data?: { message?: string } }
              }
              const msg = ev.message ?? ev.error?.data?.message ?? ev.error?.message
              if ((ev.type === 'error' || ev.type === 'turn.failed' || ev.type === 'session.error') && msg) {
                last = msg
                code = 1
              }
            } catch {}
          }
        }
        code = code ?? 0
      } catch (err) {
        last = `${String((err as Error).message ?? err)} ${stderr.slice(-300)}`.trim()
        code = 1
      } finally {
        settleId(null)
        onEnd(last, code)
      }
    })()
    $.clock.after(30_000, () => settleId(null))
  })
}

async function resolveSession($: Dollar, ref: string): Promise<CodexSession | undefined> {
  const [list, names] = await Promise.all([read($, codexA), read($, namesA)])
  const want = ref.trim().toLowerCase()
  return (
    list.find(s => s.id === ref.trim()) ??
    list.find(s => (names[s.id] ?? '').toLowerCase() === want) ??
    list.find(s => s.id.toLowerCase().endsWith(want))
  )
}

/** Scroll the Outpost pane to its end: the newest messages and the composer. */
const jumpToNewest = ($: Dollar) => $.ui.scroll({ to: 'end', in: PANE }).catch(() => undefined)

// Sets or clears one key of a flag map: update($, someAtom, flag(key, on)).
const flag = (key: string, on: boolean) => (m: Record<string, boolean>) => {
  const next = { ...m }
  if (on) next[key] = true
  else delete next[key]
  return next
}

async function setFailed($: Dollar, id: string, why: string | undefined) {
  await update($, failedA, m => {
    const next = { ...m }
    if (why) next[id] = why
    else delete next[id]
    return next
  })
}

function finish(
  $: Dollar,
  id: () => string | null,
  name: string,
  provider: ExternalProvider,
  onDone?: (sid: string | null, code: number | null, last?: string) => Promise<void>,
) {
  const label = PROVIDER[provider].label
  return async (last: string | undefined, code: number | null) => {
    const sid = id()
    if (sid) {
      await update($, busyA, flag(sid, false))
      await setFailed($, sid, code === 0 ? undefined : (last ?? `${label} exited with an error`).slice(0, 300))
    }
    $.ui.toast(code === 0 ? `${name} (${label}) finished` : `${name} (${label}) failed: ${(last ?? '').slice(0, 120)}`)
    await refresh($)
    const sel = await read($, selectedA)
    const open = sid && sel?.id === sid ? (await read($, codexA)).find(x => x.id === sid) : undefined
    if (open) await refreshTimeline($, open).catch(() => undefined)
    if (onDone) await onDone(sid, code, last).catch(() => undefined)
  }
}

/** A random v4 UUID (Copilot lets the caller choose a new session's id). */
function uuid(): string {
  const hex = [...Array(32)].map(() => Math.floor(Math.random() * 16).toString(16))
  hex[12] = '4'
  hex[16] = ((parseInt(hex[16] ?? '0', 16) & 0x3) | 0x8).toString(16)
  const h = hex.join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** What runAgent needs to keep an Antigravity log: the user line, the id when known. */
type AgentLog = { id?: string; user: Record<string, unknown> }

let agyDir: string | null = null
async function agyLogDir($: Dollar): Promise<string> {
  if (!agyDir) agyDir = (await runJson<{ antigravity: string }>($, ['node', scanner($), 'logdir'])).antigravity
  return agyDir
}

/** agy has no attach flag: name the pictures in the message, its tools read them. */
const withImagePaths = (text: string, images: string[] = []) =>
  images.length ? `${text}\n\nAttached images (read them from disk):\n${images.map(p => `- ${p}`).join('\n')}` : text

type StartOptions = {
  name: string
  prompt: string
  images?: string[]
  cwd?: string
  model?: string
  sandbox?: string
  autoApprove?: boolean
}

/** How each CLI starts a new session non-interactively. */
function startCommand(
  provider: ExternalProvider,
  cli: string[],
  o: StartOptions,
): { argv: string[]; input?: string; id?: string } {
  const cwd = o.cwd ? [o.cwd] : []
  switch (provider) {
    case 'codex':
      return {
        argv: [
          ...cli, 'exec', ...imageFlags('-i', o.images), '--json', '--skip-git-repo-check',
          ...cwd.flatMap(d => ['-C', d]),
          ...(o.model ? ['-m', o.model] : []),
          ...(o.sandbox ? ['-s', o.sandbox] : []),
          '-',
        ],
        input: o.prompt,
      }
    case 'opencode':
      return {
        argv: [
          ...cli, 'run', ...imageFlags('-f', o.images), '--format', 'json', '--title', o.name,
          ...cwd.flatMap(d => ['--dir', d]),
          ...(o.model ? ['-m', o.model] : []),
          ...(o.autoApprove ? ['--auto'] : []),
          o.prompt,
        ],
      }
    case 'antigravity':
      return {
        argv: [
          ...cli, '-p', withImagePaths(o.prompt, o.images), '--output-format', 'stream-json',
          ...(o.model ? ['--model', o.model] : []),
          ...(o.autoApprove ? ['--dangerously-skip-permissions'] : []),
        ],
      }
    case 'copilot': {
      const id = uuid()
      return {
        id,
        argv: [
          ...cli, '-p', o.prompt, '--session-id', id, '-n', o.name, '--output-format', 'json',
          ...cwd.flatMap(d => ['-C', d]),
          ...(o.model ? ['--model', o.model] : []),
          ...(o.autoApprove ? ['--allow-all-tools'] : []),
          ...imageFlags('--attachment', o.images),
        ],
      }
    }
  }
}

/** How each CLI continues an existing session with one more message. */
function sendCommand(
  s: CodexSession,
  cli: string[],
  text: string,
  autoApprove: boolean,
  images: string[] = [],
): { argv: string[]; input?: string } {
  switch (s.provider) {
    case 'codex':
      return { argv: [...cli, 'exec', 'resume', ...imageFlags('-i', images), '--json', '--skip-git-repo-check', s.id, '-'], input: text }
    case 'opencode':
      return {
        argv: [...cli, 'run', ...imageFlags('-f', images), '--format', 'json', '-s', s.id, ...(s.cwd ? ['--dir', s.cwd] : []), ...(autoApprove ? ['--auto'] : []), text],
      }
    case 'antigravity':
      return {
        argv: [
          ...cli, '-p', withImagePaths(text, images), '--conversation', s.id, '--output-format', 'stream-json',
          ...(s.model ? ['--model', s.model] : []),
          ...(autoApprove ? ['--dangerously-skip-permissions'] : []),
        ],
      }
    case 'copilot':
      return {
        argv: [
          ...cli, '-p', text, '--resume', s.id, '--output-format', 'json',
          ...(s.cwd ? ['-C', s.cwd] : []),
          ...(autoApprove ? ['--allow-all-tools'] : []),
          ...imageFlags('--attachment', images),
        ],
      }
  }
}

async function sendToAgent(
  $: Dollar,
  s: CodexSession,
  text: string,
  name: string,
  images: string[] = [],
  onDone?: (sid: string | null, code: number | null, last?: string) => Promise<void>,
): Promise<void> {
  const cli = await findCli($, s.provider)
  const autoApprove = (await read($, togglesA))[`auto:${s.id}`] === true
  const { argv, input } = sendCommand(s, cli, text, autoApprove, images)
  await update($, busyA, flag(s.id, true))
  await setFailed($, s.id, undefined)
  const log: AgentLog | undefined =
    s.provider === 'antigravity'
      ? { id: s.id, user: { event: 'mod_user', text, images, model: s.model, cwd: s.cwd, t: new Date().toISOString() } }
      : undefined
  void runAgent($, argv, input, s.cwd || undefined, finish($, () => s.id, name, s.provider, onDone), log)
}

async function saveNames($: Dollar, fn: (n: Record<string, string>) => Record<string, string>) {
  const next = fn(await read($, namesA))
  await update($, namesA, () => next)
  await $.store.set('names', next)
}

// A Select takes 1 to 64 options: an engine rule, and a band whose tree breaks
// it is not drawn at all. Every option list goes through this.
const MAX_SELECT_OPTIONS = 64
type SelectOption = { value: string; label: string }
function fitOptions(options: SelectOption[], keep?: string): SelectOption[] {
  const unique = options.filter((o, i) => options.findIndex(x => x.value === o.value) === i)
  if (unique.length <= MAX_SELECT_OPTIONS) return unique.length ? unique : [{ value: 'default', label: 'Default model' }]
  const head = unique.slice(0, MAX_SELECT_OPTIONS - 1)
  const kept = keep ? unique.find(o => o.value === keep) : undefined
  return kept && !head.includes(kept) ? [...head, kept] : unique.slice(0, MAX_SELECT_OPTIONS)
}

// ── Talk: the main prompt box speaks to another provider ────────────────
// The band above the prompt box picks a provider and model; a prompt.submit
// hook then takes each prompt away from Claude and sends it to that
// provider's direct conversation. Replies come back into the chat: as
// notices Claude never reads, or (shared) as messages Claude does read.

/** Start a new session of `provider` running `o`. Resolves its id, or null. */
async function startAgent(
  $: Dollar,
  provider: ExternalProvider,
  o: StartOptions,
  onDone?: (sid: string | null, code: number | null, last?: string) => Promise<void>,
): Promise<string | null> {
  const cwd = o.cwd || (await $.session.cwd()) || undefined
  const cli = await findCli($, provider)
  const cmd = startCommand(provider, cli, { ...o, cwd })
  let sessionId: string | null = cmd.id ?? null
  const log: AgentLog | undefined =
    provider === 'antigravity'
      ? { user: { event: 'mod_user', text: o.prompt, images: o.images ?? [], model: o.model, cwd, t: new Date().toISOString() } }
      : undefined
  const reported = runAgent($, cmd.argv, cmd.input, cwd, finish($, () => sessionId, o.name, provider, onDone), log)
  if (!sessionId) sessionId = await reported
  if (!sessionId) return null
  const id = sessionId
  await update($, ownedA, x => ({ ...x, [id]: true }))
  await persistOwned($)
  await saveNames($, n => ({ ...n, [id]: o.name }))
  if (o.autoApprove) await update($, togglesA, flag(`auto:${id}`, true))
  await update($, busyA, flag(id, true))
  void refresh($)
  return id
}

/** One talk conversation per provider and model. */
const talkKey = (p: ExternalProvider, model?: string) => `${p}:${model ?? ''}`

/** Put a line in the main chat: a notice Claude never reads, or (shared) a message it does. */
async function postToChat($: Dollar, text: string, shared: boolean) {
  try {
    await $.session.append({ message: { type: shared ? 'user' : 'system', content: [{ type: 'text', text }] } })
  } catch (err) {
    $.ui.toast(`Couldn't add that to the chat: ${String((err as Error).message ?? err).slice(0, 120)}`)
  }
}

async function persistTalk($: Dollar) {
  await $.store.set(`talk:${await $.session.id()}`, await read($, talkA))
}

/** When a talk run ends: post the provider's last answer (or its error) in the chat. */
async function deliverTalkReply($: Dollar, provider: ExternalProvider, model: string | undefined, sid: string | null, code: number | null, last?: string) {
  const talk = await read($, talkA)
  const head = `${PROVIDER[provider].label}${model ? ` · ${model}` : ''}`
  let answer = ''
  const s = sid ? (await read($, codexA)).find(x => x.id === sid) : undefined
  if (s) {
    try {
      const items = await runJson<TimelineItem[]>($, ['node', scanner($), 'show', s.provider, s.ref])
      const end = [...items].reverse()
      answer = (end.find(i => i.kind === 'agent' || i.kind === 'error')?.text ?? '').trim()
    } catch {}
  }
  const body = code === 0 ? answer || '(no reply)' : `Failed: ${answer || last || 'the CLI exited with an error'}`
  await postToChat(
    $,
    talk.shared ? `[Reply from ${head}, which the user is talking to directly]\n\n${body}` : `**${head}** →\n\n${body}`,
    talk.shared,
  )
  await update($, talkA, t => ({ ...t, busy: false }))
  await persistTalk($)
}

/** Open the Outpost pane on one external session, its timeline loaded. */
async function showInPane($: Dollar, provider: ExternalProvider, id: string) {
  await update($, selectedA, () => ({ provider, id }))
  await markSeen($, `${provider}:${id}`)
  await refresh($)
  const s = (await read($, codexA)).find(x => x.id === id)
  if (s) await refreshTimeline($, s)
  void $.ui.open({ id: PANE, title: TITLE })
  void jumpToNewest($)
}

/** Send one prompt from the main box to the chosen provider. */
async function talkTo($: Dollar, text: string) {
  const talk = await read($, talkA)
  const p = talk.provider as ExternalProvider
  const model = talk.models[p] || undefined
  const head = `${PROVIDER[p].label}${model ? ` · ${model}` : ''}`
  await postToChat(
    $,
    talk.shared ? `[The user sent this to ${head} directly, not to you]\n\n${text}` : `**You → ${head}**\n\n${text}`,
    talk.shared,
  )
  await update($, talkA, t => ({ ...t, busy: true }))
  const onDone = (sid: string | null, code: number | null, last?: string) => deliverTalkReply($, p, model, sid, code, last)
  const key = talkKey(p, model)
  const existing = talk.sessions[key] ? (await read($, codexA)).find(s => s.id === talk.sessions[key]) : undefined
  try {
    let id: string
    if (existing) {
      await sendToAgent($, existing, text, agentName(existing, await read($, namesA)), [], onDone)
      id = existing.id
    } else {
      const started = await startAgent($, p, { name: `${PROVIDER[p].label} chat`, prompt: text, model, autoApprove: talk.autoApprove }, onDone)
      if (!started) throw new Error(`${PROVIDER[p].label} did not report a session id`)
      id = started
      await update($, talkA, t => ({ ...t, sessions: { ...t.sessions, [key]: started } }))
    }
    await showInPane($, p, id)
  } catch (err) {
    await update($, talkA, t => ({ ...t, busy: false }))
    await postToChat($, `**${head}** couldn't start: ${String((err as Error).message ?? err).slice(0, 300)}`, false)
  }
  await persistTalk($)
}

/**
 * The Python to run the picture helpers with: the first of python, python3
 * and py -3 that has Pillow. Null when there is none; `orThrow` throws then.
 */
let pythonArgv: string[] | null | undefined
async function findPython($: Dollar, orThrow: true): Promise<string[]>
async function findPython($: Dollar, orThrow?: false): Promise<string[] | null>
async function findPython($: Dollar, orThrow = false): Promise<string[] | null> {
  if (pythonArgv === undefined) {
    try {
      pythonArgv = (await runJson<{ argv: string[] | null }>($, ['node', scanner($), 'python'], 60_000)).argv
    } catch {
      pythonArgv = null
    }
  }
  if (!pythonArgv && orThrow) throw new Error('Python 3 with Pillow not found (pip install pillow)')
  return pythonArgv
}

async function loadModelLists($: Dollar) {
  try {
    const installed = await runJson<Record<string, boolean>>($, ['node', scanner($), 'installed'], 30_000)
    await update($, installedA, () => installed)
  } catch {}
  try {
    const lists = await runJson<Record<string, string[]>>($, ['node', scanner($), 'models'], 60_000)
    await update($, modelListsA, () => lists)
  } catch {}
}

const markSeen = ($: Dollar, key: string) => update($, seenA, m => ({ ...m, [key]: Date.now() }))

// ── Rows ─────────────────────────────────────────────────────────────────
type Row = {
  key: string
  provider: ProviderKey
  id: string
  name: string
  status: RosterStatus
  isBusy: boolean
  failure?: string
  sub: string
  when?: number
  model?: string
  isUnread: boolean
}
const isLive = (r: Row) => r.isBusy || r.status === 'running' || r.status === 'pending' || r.status === 'waiting'
const needsAttention = (r: Row) => !isLive(r) && (r.failure !== undefined || ['failed', 'killed', 'stalled'].includes(r.status))

// ── The module ───────────────────────────────────────────────────────────
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    const sessionId = await $.session.id()

    // This Claude session's start and the external sessions it owns, kept per session.
    const keyStarted = `started:${sessionId}`
    let startedAt = Number(await $.store.get(keyStarted)) || 0
    if (!startedAt) {
      startedAt = Date.now()
      await $.store.set(keyStarted, startedAt)
    }
    await update($, startedA, () => startedAt)

    const storedNames = (await $.store.get('names')) as Record<string, string> | undefined
    if (storedNames && typeof storedNames === 'object') await update($, namesA, () => storedNames)
    const storedLogos = (await $.store.get('logos')) as Record<string, string> | undefined
    if (storedLogos && typeof storedLogos === 'object') await update($, logosA, () => storedLogos)
    void fetchMissingLogos($)
    const storedPicks = (await $.store.get('mascotPicks')) as Record<string, string> | undefined
    if (storedPicks && typeof storedPicks === 'object') await update($, picksA, () => storedPicks)
    const storedTalk = (await $.store.get(`talk:${sessionId}`)) as TalkState | undefined
    if (storedTalk && typeof storedTalk === 'object') await update($, talkA, () => ({ ...storedTalk, busy: false }))
    void loadModelLists($)
    const storedClaude = (await $.store.get(`claude:${sessionId}`)) as ClaudeAgent[] | undefined
    if (Array.isArray(storedClaude)) await update($, claudeA, () => storedClaude)
    const storedMeta = (await $.store.get(`claude-meta:${sessionId}`)) as Record<string, ClaudeMeta> | undefined
    if (storedMeta && typeof storedMeta === 'object') await update($, claudeMetaA, () => storedMeta)
    await loadMascots($)
    const storedAvatars = (await $.store.get('avatars')) as Record<string, string> | undefined
    if (storedAvatars && typeof storedAvatars === 'object') await update($, avatarsA, () => storedAvatars)

    let owned = (await $.store.get(`owned:${sessionId}`)) as Record<string, boolean> | undefined
    if (!owned && !(await $.store.get('migrated-owned'))) {
      // v0.1 kept no owner record: every named session so far was started here.
      owned = Object.fromEntries(Object.keys(storedNames ?? {}).map(id => [id, true]))
      await $.store.set('migrated-owned', true)
    }
    await update($, ownedA, () => owned ?? {})
    await persistOwned($)

    await $.command.register({ name: 'outpost', description: 'Open the Outpost pane (Claude, Codex, opencode, Copilot and Antigravity agents)' })
    await $.command.register({
      name: 'talk',
      description: 'Send your prompts to another agent: /talk <codex|opencode|copilot|antigravity> [model]; /talk claude to switch back',
      argumentHint: '<provider> [model]',
    })
    await $.command.register({
      name: 'avatar',
      description: 'Set an agent avatar: /avatar <name> <image URL or file>; /avatar <name> clears it',
      argumentHint: '<name> [url-or-path]',
    })

    await $.tool.register({
      name: 'agent_start',
      isDeferred: false,
      description:
        'Start an external coding agent (Codex, opencode, GitHub Copilot CLI or Antigravity `agy`) in the background and show it in the Outpost pane. ' +
        'Give it a short character name (it shows with its avatar). Returns the session id; use agent_send for ' +
        'follow-ups and agent_sessions to read status and the final answer. opencode, Copilot and Antigravity only run ' +
        'tools without asking when autoApprove is true; Codex uses `sandbox` instead.',
      inputSchema: {
        type: 'object',
        properties: {
          provider: { type: 'string', enum: ['codex', 'opencode', 'copilot', 'antigravity'] },
          name: { type: 'string', description: 'Display name, e.g. a character name' },
          prompt: { type: 'string', description: 'The task for the agent' },
          cwd: { type: 'string', description: 'Absolute working folder (defaults to this session’s)' },
          model: {
            type: 'string',
            description:
              'Model id: Codex e.g. gpt-6.1-terra; opencode provider/model; Copilot its model name; Antigravity e.g. gemini-3.8-flash-high (`agy models`). Defaults to the CLI’s config',
          },
          sandbox: { type: 'string', enum: ['read-only', 'workspace-write', 'danger-full-access'], description: 'Codex only' },
          autoApprove: { type: 'boolean', description: 'opencode --auto / Copilot --allow-all-tools / agy --dangerously-skip-permissions' },
          images: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of pictures to attach' },
        },
        required: ['provider', 'name', 'prompt'],
      },
    })
    await $.tool.register({
      name: 'agent_send',
      isDeferred: false,
      description:
        'Send a follow-up message to an existing external agent session (by name or id). Runs in the background; ' +
        'the Outpost pane shows progress and agent_sessions returns the reply when done.',
      inputSchema: {
        type: 'object',
        properties: {
          session: { type: 'string', description: 'Session name or id' },
          prompt: { type: 'string' },
          images: { type: 'array', items: { type: 'string' }, description: 'Absolute paths of pictures to attach' },
        },
        required: ['session', 'prompt'],
      },
    })
    await $.tool.register({
      name: 'agent_sessions',
      isDeferred: false,
      description:
        'List this session’s external agents (Codex, opencode, Copilot, Antigravity: name, provider, id, status, last action), ' +
        'or with `session` get one session’s status and last answer.',
      inputSchema: { type: 'object', properties: { session: { type: 'string' } } },
    })

    void $.ui.open({ id: PANE, title: TITLE })
    void refresh($)
    $.clock.every(3000, () => void refresh($))

    return started
  })

  // ── Claude agents: what $.agent.list() doesn't say ──
  on('agent.spawn', async ($, e, next) => {
    const result = await next(e)
    try {
      if (result.agentId && result.model) await saveMeta($, result.agentId, { model: result.model })
    } catch {}
    return result
  }).catch(($, e, next) => next(e))
  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    try {
      if (e.agentId) {
        const u = e.usage
        await saveMeta($, e.agentId, {
          ...(e.answer ? { answer: e.answer.slice(0, 8000) } : {}),
          ...(u?.model ? { model: u.model } : {}),
          ...(u ? { tokens: (u.input_tokens ?? 0) + (u.output_tokens ?? 0) } : {}),
          endedAt: Date.now(),
        })
        void refresh($)
      }
    } catch {}
    return result
  }).catch(($, e, next) => next(e))

  // ── Talk: prompts typed in the main box go to the chosen provider ──
  on('prompt.submit', async ($, e, next) => {
    const talk = await read($, talkA)
    // Claude selected, a slash command, an engine-made prompt or nothing typed: Claude's
    if (talk.provider === 'claude' || e.command || e.isMeta || !e.text.trim()) return next(e)
    const p = talk.provider
    const head = `${PROVIDER[p].label}${talk.models[p] ? ` · ${talk.models[p]}` : ''}`
    if (talk.busy) return { drop: `${head} is still answering in the Outpost pane. Wait for its reply, or pick Claude above the prompt box.` }
    void talkTo($, e.text).catch(() => undefined) // runs on after the prompt is dropped
    const pictures = (e.attachments ?? []).some(a => a.type === 'image')
      ? ' Pictures pasted into the prompt box can’t be passed on: attach them in the Outpost pane instead.'
      : ''
    return { drop: `Sent to ${head}. The reply appears in the Outpost pane.${pictures}` }
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'talk' }, async ($, e) => {
    const [want = '', model = ''] = e.args.trim().split(/\s+/, 2)
    const talk = await read($, talkA)
    if (!want) {
      return {
        text:
          talk.provider === 'claude'
            ? 'Talking to Claude. /talk <codex|opencode|copilot|antigravity> [model] to switch.'
            : `Talking to ${PROVIDER[talk.provider].label}${talk.models[talk.provider] ? ` · ${talk.models[talk.provider]}` : ''}. /talk claude to switch back.`,
      }
    }
    const p = want.toLowerCase()
    if (p !== 'claude' && !(p in PROVIDER)) return { text: `Unknown provider "${want}". Use claude, codex, opencode, copilot or antigravity.` }
    await update($, talkA, t => ({
      ...t,
      provider: p as TalkState['provider'],
      models: p !== 'claude' && model ? { ...t.models, [p]: model } : t.models,
    }))
    await persistTalk($)
    return {
      text:
        p === 'claude'
          ? 'Back to Claude.'
          : `Talking to ${PROVIDER[p as ExternalProvider].label}${model ? ` · ${model}` : ''}: your prompts go there until you pick Claude again.`,
    }
  })

  // ── The band above the prompt box: who you're talking to ──
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button } = table
    const Select: any = 'Select' in table ? table.Select : undefined
    const talk: TalkState = await read($, talkA)
    const lists: Record<string, string[]> = await read($, modelListsA)
    const installed: Record<string, boolean> = await read($, installedA)
    const p = talk.provider
    const external = p !== 'claude'
    const color = external ? PROVIDER[p].color : undefined

    const providerOptions = [
      { value: 'claude', label: 'Claude' },
      // only the CLIs this machine has (and the one picked, should it vanish)
      ...(Object.keys(PROVIDER) as ProviderKey[])
        .filter(k => k !== 'claude' && (installed[k] !== false || k === p))
        .map(k => ({ value: k, label: PROVIDER[k].label })),
    ]
    const choose = async (value: string) => {
      await update($, talkA, t => ({ ...t, provider: value as TalkState['provider'] }))
      await persistTalk($)
    }
    const currentModel = external ? talk.models[p] || 'default' : 'default'
    // A provider with more models than one list holds (opencode has hundreds)
    // gets a family picker first: the part of the id before its first '/'.
    const all = external ? lists[p] ?? [] : []
    const familyOf = (m: string) => (m.includes('/') ? m.slice(0, m.indexOf('/')) : '')
    const families = [...new Set(all.map(familyOf).filter(Boolean))]
    const grouped = all.length > MAX_SELECT_OPTIONS - 1 && families.length > 1
    const currentFamily = external
      ? talk.families?.[p] ?? (familyOf(currentModel) || families[0] || '')
      : ''
    const shown = grouped ? all.filter(m => familyOf(m) === currentFamily) : all
    const modelOptions = external
      ? fitOptions(
          [
            { value: 'default', label: 'Default model' },
            ...(currentModel !== 'default' && !shown.includes(currentModel) ? [{ value: currentModel, label: currentModel }] : []),
            ...shown.map(m => ({ value: m, label: grouped ? m.slice(currentFamily.length + 1) : m })),
          ],
          currentModel,
        )
      : []
    const familyOptions = grouped ? fitOptions(families.map(f => ({ value: f, label: f })), currentFamily) : []

    // no Select on this surface: a line and /talk
    if (!Select) {
      return (
        <Box>
          <Text color={color} dimColor={!external}>
            {external ? `→ ${PROVIDER[p].label}${talk.models[p] ? ` · ${talk.models[p]}` : ''} (/talk claude to switch back)` : ''}
          </Text>
        </Box>
      )
    }

    return (
      <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
        <Text dimColor={!external} color={color}>
          {external ? '→ Talking to' : 'Talking to'}
        </Text>
        <Select key="talk-provider" options={fitOptions(providerOptions, p)} value={p} onSelect={(v: string) => void choose(v)} />
        {external && grouped && (
          <Select
            key="talk-family"
            options={familyOptions}
            value={currentFamily}
            onSelect={async (v: string) => {
              await update($, talkA, t => ({ ...t, families: { ...t.families, [p]: v } }))
              await persistTalk($)
            }}
          />
        )}
        {external && (
          <Select
            key="talk-model"
            options={modelOptions}
            value={currentModel}
            onSelect={async (v: string) => {
              await update($, talkA, t => ({ ...t, models: { ...t.models, [p]: v === 'default' ? '' : v } }))
              await persistTalk($)
            }}
          />
        )}
        {external && (
          <Button
            key="talk-share"
            plain
            dimColor={!talk.shared}
            label={talk.shared ? '● Shared with Claude' : '○ Share with Claude'}
            onPress={async () => {
              await update($, talkA, t => ({ ...t, shared: !t.shared }))
              await persistTalk($)
            }}
          />
        )}
        {external && (
          <Button
            key="talk-auto"
            plain
            dimColor={!talk.autoApprove}
            label={talk.autoApprove ? '● Auto-approve tools' : '○ Auto-approve tools'}
            onPress={async () => {
              await update($, talkA, t => ({ ...t, autoApprove: !t.autoApprove }))
              await persistTalk($)
            }}
          />
        )}
        {external && talk.sessions[talkKey(p, talk.models[p] || undefined)] && (
          <Button
            key="talk-new"
            plain
            dimColor
            label="New conversation"
            onPress={async () => {
              const key = talkKey(p, talk.models[p] || undefined)
              await update($, talkA, t => {
                const sessions = { ...t.sessions }
                delete sessions[key]
                return { ...t, sessions }
              })
              await persistTalk($)
              $.ui.toast(`Your next prompt starts a new ${PROVIDER[p].label} conversation`)
            }}
          />
        )}
        {talk.busy && <Text color={C.run}>{PROVIDER[p as ProviderKey]?.label ?? 'It'} is answering…</Text>}
      </Box>
    )
  })

  // ── Commands ──
  on('command.run', { command: 'outpost' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    void refresh($)
    return { text: 'Outpost pane opened.' }
  }).catch(() => ({ text: 'outpost: could not open the pane.' }))

  on('command.run', { command: 'avatar' }, async ($, e) => {
    const args = e.args.trim()
    if (!args) {
      const names = Object.keys(await read($, avatarsA))
      return { text: names.length ? `Avatars set for: ${names.join(', ')}` : 'No avatars yet. /avatar <name> <url-or-path>' }
    }
    const m = /^(.+?)\s+((?:https?:\/\/|[A-Za-z]:[\\/]|\/|~)\S*)$/.exec(args)
    if (!m) {
      const key = args.toLowerCase()
      await update($, avatarsA, a => {
        const n = { ...a }
        delete n[key]
        return n
      })
      await $.store.set('avatars', await read($, avatarsA))
      return { text: `Avatar cleared for ${args}.` }
    }
    const [, rawName = '', source = ''] = m
    const name = rawName.trim().toLowerCase()
    const py = await findPython($)
    if (!py) return { text: 'Avatars need Python 3 with Pillow (pip install pillow); none was found on the PATH.' }
    const ran = await $.process.run([...py, '-I', `${$.plugin.root}/scripts/avatar.py`, source], { timeoutMs: 40_000 })
    if (ran.exitCode !== 0 || !ran.stdout) {
      return { text: `Couldn't load that picture: ${(ran.stderr || 'no output').slice(0, 200)}` }
    }
    const png = ran.stdout.trim()
    await update($, avatarsA, a => ({ ...a, [name]: png }))
    await $.store.set('avatars', await read($, avatarsA))
    return { text: `Avatar set for ${rawName.trim()}.` }
  })

  // ── Tools the model calls ──
  on('tool.call', { tool: 'mcp__outpost__agent_start' }, async ($, e) => {
    const input = e as unknown as StartOptions & { provider: ExternalProvider }
    if (!PROVIDER[input.provider] || input.provider === ('claude' as string)) {
      return { result: `Unknown provider "${input.provider}". Use codex, opencode, copilot or antigravity.` }
    }
    const id = await startAgent($, input.provider, input)
    const label = PROVIDER[input.provider].label
    if (!id) {
      return { result: `${label} started for ${input.name}, but it has not reported a session id yet; check agent_sessions shortly.` }
    }
    return {
      result: `Started ${label} agent "${input.name}" (session ${id}). It runs in the background and shows in the Outpost pane. Use agent_sessions to read its answer when it finishes.`,
    }
  }).catch(() => ({ deny: 'outpost: agent_start failed; see the Outpost pane for the error.' }))

  on('tool.call', { tool: 'mcp__outpost__agent_send' }, async ($, e) => {
    const input = e as unknown as { session: string; prompt: string; images?: string[] }
    await refresh($)
    const s = await resolveSession($, input.session)
    if (!s) return { result: `No external agent of this Claude session matches "${input.session}". Call agent_sessions to list them.` }
    const name = agentName(s, await read($, namesA))
    await sendToAgent($, s, input.prompt, name, input.images ?? [])
    return { result: `Sent to ${name} (${PROVIDER[s.provider].label}, session ${s.id}). It runs in the background; agent_sessions returns its reply when done.` }
  }).catch(() => ({ deny: 'outpost: agent_send failed; see the Outpost pane for the error.' }))

  on('tool.call', { tool: 'mcp__outpost__agent_sessions' }, async ($, e) => {
    const input = e as unknown as { session?: string }
    await refresh($)
    const [list, names, busy, failed] = await Promise.all([read($, codexA), read($, namesA), read($, busyA), read($, failedA)])
    const status = (s: CodexSession) => (busy[s.id] ? 'running' : failed[s.id] ? `failed: ${failed[s.id]}` : s.status)
    if (input.session) {
      const s = await resolveSession($, input.session)
      if (!s) return { result: `No external agent of this Claude session matches "${input.session}".` }
      const items = await runJson<TimelineItem[]>($, ['node', scanner($), 'show', s.provider, s.ref])
      const lastAnswer = [...items].reverse().find(i => i.kind === 'agent' || i.kind === 'error')?.text
      return {
        result: [
          `${agentName(s, names)} — ${PROVIDER[s.provider].label} session ${s.id}`,
          `status: ${status(s)}; model: ${s.model ?? '?'}; cwd: ${s.cwd}; updated ${ago(s.updatedAt)}`,
          `last action: ${s.lastAction ?? '—'}`,
          '',
          'last answer:',
          lastAnswer ?? '(none yet)',
        ].join('\n'),
      }
    }
    if (!list.length) return { result: 'No external agents in this Claude session yet.' }
    return {
      result: list
        .map(
          s =>
            `- ${agentName(s, names)} (${PROVIDER[s.provider].label}) [${status(s)}] ${s.id} · ${s.model ?? '?'} · ${ago(s.updatedAt)} · ${s.title}`,
        )
        .join('\n'),
    }
  }).catch(() => ({ deny: 'outpost: agent_sessions failed; see the Outpost pane for the error.' }))

  // ── Agents launched by a shell command here ──
  // opencode and Copilot don't record who started them, so a Bash or
  // PowerShell call that runs one of their CLIs claims the sessions that
  // start while it runs (plus 30 s, for commands sent to the background).
  on('tool.call', async ($, e, next) => {
    if (e.tool !== 'Bash' && e.tool !== 'PowerShell') return next(e)
    const command = String((e as unknown as { command?: unknown }).command ?? '')
    const hits = (Object.keys(CLI_PATTERN) as ExternalProvider[]).filter(p => CLI_PATTERN[p].test(command))
    if (!hits.length) return next(e)
    const from = Date.now() - 2_000
    await update($, claimsA, c => [...c, ...hits.map(provider => ({ provider, from, to: from + 15 * 60_000 }))].slice(-50))
    const ran = await next(e)
    const to = Date.now() + 30_000
    await update($, claimsA, c => c.map(x => (x.from === from && hits.includes(x.provider) ? { ...x, to } : x)))
    void refresh($)
    return ran
  }).catch(($, e, next) => next(e))

  // ── The pane ──
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    // The element table differs per surface: desktop has Svg, the terminal Image.
    const table: any = $.ui.resolve(e)
    const { Box, Text, Button, Input } = table
    const Svg: any = 'Svg' in table ? table.Svg : undefined
    const Image: any = 'Image' in table ? table.Image : undefined
    const Markdown: any = 'Markdown' in table ? table.Markdown : undefined
    const Code: any = 'Code' in table ? table.Code : undefined
    const Client: any = 'Client' in table ? table.Client : undefined
    const rich = Svg !== undefined // desktop-like surfaces: colours, pills, bubbles

    const codex: CodexSession[] = await read($, codexA)
    const claude: ClaudeAgent[] = await read($, claudeA)
    const selected: Selection = await read($, selectedA)
    const timeline: TimelineItem[] = await read($, timelineA)
    const avatars: Record<string, string> = await read($, avatarsA)
    const names: Record<string, string> = await read($, namesA)
    const busy: Record<string, boolean> = await read($, busyA)
    const failed: Record<string, string> = await read($, failedA)
    const seen: Record<string, number> = await read($, seenA)
    const hidden: Record<string, boolean> = await read($, hiddenA)
    const toggles: Record<string, boolean> = await read($, togglesA)
    const drafts: Record<string, string> = await read($, draftsA)
    const thumbs: Record<string, Thumb> = await read($, thumbsA)
    const attachments: Record<string, string[]> = await read($, attachA)
    const logos: Record<string, string> = await read($, logosA)
    const mascots: Record<string, string> = await read($, mascotsA)
    const picks: Record<string, string> = await read($, picksA)
    const error: string = await read($, errorA)

    // ── drawing helpers ──
    const icon = (body: string, size: number, alt: string) =>
      rich ? <Svg source={iconSvg(body, size)} alt={alt} width={size} height={size} /> : null

    const avatar = (name: string, size: number) => {
      const png = avatarFor(avatars, name) ?? mascots[picks[nameKey(name)] ?? '']
      if (Svg) return <Svg source={avatarSvg(name, png, size)} alt={`${name}`} width={size} height={size} />
      if (Image && png) return <Image source={{ png }} columns={size > 40 ? 6 : 4} />
      return <Text color={`hsl(${hue(name)},45%,55%)`}>■</Text>
    }

    const pill = (label: string, color: string, iconBody?: string, filled = false, logoPng?: string) => {
      if (!rich) return <Text color={color}>[{label}]</Text>
      const p = pillSvg(label, color, iconBody, filled, logoPng)
      return <Svg source={p.source} alt={label} width={p.width} height={22} />
    }

    const providerPill = (p: ProviderKey, extra?: string) =>
      pill(extra ? `${PROVIDER[p].label} · ${extra}` : PROVIDER[p].label, PROVIDER[p].color, ICON[p](PROVIDER[p].color), false, logos[p])

    const statusPill = (sv: StatusView) => pill(sv.label, sv.color, sv.icon(sv.color), true)

    const toggle = (key: string) => () => void update($, togglesA, t => ({ ...t, [key]: !t[key] }))

    // A picture from its preview: an SVG wrapping the JPEG (desktop), or a
    // line naming it where the surface draws no SVG.
    const picture = (file: string, maxW: number, alt: string) => {
      const t = thumbs[file]
      if (!t) return <Text dimColor>Loading preview…</Text>
      if (t.error || !t.data || !t.w || !t.h) return <Text dimColor>Preview unavailable · {fileName(file)}</Text>
      if (!Svg) return <Text dimColor>[image] {fileName(file)}</Text>
      // (not `h`: that name is the JSX factory)
      const pw = Math.min(maxW, t.w)
      const ph = Math.round((t.h * pw) / t.w)
      const source =
        `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="0 0 ${t.w} ${t.h}">` +
        `<image href="data:${t.mime ?? 'image/jpeg'};base64,${t.data}" width="${t.w}" height="${t.h}"/></svg>`
      return <Svg source={source} alt={alt} width={pw} height={ph} />
    }
    const pictureWithOpen = (file: string, maxW: number, key: string, alt: string) => (
      <Box key={key} flexDirection="column" gap={0} alignItems="flex-start">
        {picture(file, maxW, alt)}
        <Button key={`open-${key}`} plain dimColor label="↗ Open full size" onPress={() => void openFile($, file)} />
      </Box>
    )


    // ── Detail view ──
    if (selected) {
      const backButton = <Button key="back" label="← All agents" onPress={() => void update($, selectedA, () => null)} />

      if (selected.provider === 'claude') {
        const a = claude.find(x => x.id === selected.id)
        if (!a) return <Box flexDirection="column" gap={1}>{backButton}<Text dimColor>That agent is no longer listed.</Text></Box>
        const name = a.name ?? a.description
        const sv = statusView(a.status, {})
        return (
          <Box flexDirection="column" gap={1}>
            <Box
              flexDirection="row"
              gap={2}
              alignItems="center"
              paddingX={1}
              paddingY="sm"
              borderStyle="round"
              borderColor={rich ? '#ffffff2e' : undefined}
              backgroundColor={rich ? '#ffffff08' : undefined}
            >
              {backButton}
              {avatar(name, 48)}
              <Box flexDirection="column" gap={0} flexGrow={1} flexShrink={1} minWidth={0}>
                <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                  <Text bold>{name}</Text>
                  {providerPill('claude', a.model ?? a.type)}
                  {statusPill(sv)}
                </Box>
                <Text dimColor wrap="truncate-end">
                  {a.type}
                  {a.endedAt ? ` · ${ago(a.endedAt)}` : ''}
                  {a.tokens ? ` · ~${Math.round(a.tokens / 1000)}k tokens` : ''}
                </Text>
              </Box>
            </Box>
            {a.name && <Text dimColor>{a.description}</Text>}
            {a.answer ? (
              <Box flexDirection="row" gap={1} alignItems="flex-start">
                {avatar(name, 28)}
                <Box flexDirection="column" gap={0} width="82%">
                  <Box flexDirection="column" paddingX={1} paddingY="xs" borderStyle="round" borderColor={rich ? C.agentBorder : undefined}>
                    {Markdown ? <Markdown text={a.answer} /> : <Text>{a.answer}</Text>}
                  </Box>
                  {a.endedAt !== undefined && <Text dimColor>{ago(a.endedAt)}</Text>}
                </Box>
              </Box>
            ) : (
              <Text dimColor>{isLive({ status: a.status, isBusy: false } as Row) ? `${name} is working…` : 'No answer recorded.'}</Text>
            )}
            <Button
              key="open-transcript"
              label="Open full transcript"
              onPress={async () => {
                const r = await $.ui.view({ agentId: a.id })
                if ('deny' in r && r.deny) $.ui.toast(`The transcript is no longer available: ${r.deny}`)
              }}
            />
          </Box>
        )
      }

      const s = codex.find(x => x.id === selected.id)
      if (!s) return <Box flexDirection="column" gap={1}>{backButton}<Text dimColor>That session is no longer listed.</Text></Box>
      const name = agentName(s, names)
      const isBusy = busy[s.id] === true
      const sv = statusView(s.status, { busy: isBusy, failed: failed[s.id] !== undefined })

      // Group the timeline: consecutive commands/tools/thinking fold into one row.
      type Block = { type: 'item'; item: TimelineItem; i: number } | { type: 'fold'; items: TimelineItem[]; i: number }
      const blocks: Block[] = []
      const FOLDABLE = new Set(['cmd', 'tool', 'web', 'image', 'think', 'edit', 'other'])
      timeline.forEach((item, i) => {
        const prev = blocks[blocks.length - 1]
        if (FOLDABLE.has(item.kind) && !(item.kind === 'image' && item.images?.length)) {
          if (prev?.type === 'fold') prev.items.push(item)
          else blocks.push({ type: 'fold', items: [item], i })
        } else blocks.push({ type: 'item', item, i })
      })

      const foldLabel = (items: TimelineItem[]) => {
        const count = (k: string) => items.filter(x => x.kind === k).length
        const plural = (n: number, w: string) => `${n} ${w}${n > 1 ? 's' : ''}`
        const parts = [
          count('cmd') && plural(count('cmd'), 'command'),
          count('tool') && plural(count('tool'), 'tool call'),
          count('web') && plural(count('web'), 'web lookup'),
          count('edit') && plural(count('edit'), 'edit'),
          count('image') && plural(count('image'), 'image'),
        ].filter(Boolean)
        return parts.length ? `Ran ${parts.join(', ')}` : 'Thinking…'
      }

      const bubble = (side: 'left' | 'right', children: unknown, opts: { bg?: string; border?: string; when?: string }) => (
        <Box flexDirection="row" gap={1} justifyContent={side === 'right' ? 'flex-end' : 'flex-start'} alignItems="flex-start">
          {side === 'left' && avatar(name, 28)}
          <Box flexDirection="column" gap={0} width="82%" alignItems={side === 'right' ? 'flex-end' : 'flex-start'}>
            <Box
              flexDirection="column"
              paddingX={1}
              paddingY="xs"
              borderStyle="round"
              borderColor={rich ? opts.border ?? '#ffffff1f' : undefined}
              backgroundColor={rich ? opts.bg : undefined}
            >
              {children}
            </Box>
            {opts.when && <Text dimColor>{opts.when}</Text>}
          </Box>
        </Box>
      )

      const divider = (label: string, color?: string) => (
        <Box flexDirection="row" justifyContent="center">
          <Text dimColor color={color}>
            ── {label} ──
          </Text>
        </Box>
      )

      const md = (text: string) => (Markdown ? <Markdown text={text} /> : <Text>{text}</Text>)

      // ── One step inside an expanded "Ran N …" group ──
      // A row per step: glyph, tool name, short target, ✓ / ✗ / ⋯. Commands
      // show as code with their output behind a toggle; thinking is one dim
      // line that expands; a failure shows its error in red.
      const STEP_GLYPH: Record<string, string> = { cmd: '$', tool: '⚙', web: '⌕', edit: '✎', image: '▣', other: '•' }
      const clipLine = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
      const shortTarget = (t: string) => {
        const one = oneLine(t)
        if (!/[\\/]/.test(one) || /\s/.test(one.replace(/^[^\\/]*\s/, ''))) return clipLine(one, 80)
        const parts = one.split(/[\\/]/).filter(Boolean)
        return parts.length > 2 ? `…/${parts.slice(-2).join('/')}` : one
      }
      const stepRow = (x: TimelineItem, k: string) => {
        const failed = x.status === 'failed' || x.status === 'error' || /^exit /.test(x.status ?? '')
        const running = x.status === 'running' || x.status === 'in_progress' || x.status === 'pending'

        if (x.kind === 'think') {
          const open = toggles[k] === true
          return (
            <Box key={k} flexDirection="column" gap={0}>
              <Button
                key={`b-${k}`}
                plain
                dimColor
                label={open ? '▾ Thinking' : `▸ Thinking · ${clipLine(oneLine(x.text), 90)}`}
                onPress={toggle(k)}
              />
              {open && (
                <Box marginLeft={2} paddingX={1} borderStyle="round" borderColor={rich ? '#ffffff14' : undefined}>
                  {/* thinking keeps its line breaks, so lists and paragraphs
                      render; dimmed to stay quieter than the replies */}
                  {Markdown ? (
                    <Markdown text={x.text} dimColor />
                  ) : (
                    <Text dimColor italic wrap="wrap">
                      {x.text}
                    </Text>
                  )}
                </Box>
              )}
            </Box>
          )
        }

        let name: string
        let target: string
        if (x.kind === 'cmd') {
          name = 'Shell'
          target = ''
        } else if (x.kind === 'edit') {
          name = 'Edit'
          target = x.text
        } else {
          const m = /^([\w.\-]+)(?::\s*([\s\S]*))?$/.exec(x.text)
          name = m?.[1] ?? x.text
          target = m?.[2] ?? ''
        }
        name = name.charAt(0).toUpperCase() + name.slice(1)
        const outKey = `${k}:out`
        const showOut = toggles[outKey] === true

        return (
          <Box key={k} flexDirection="column" gap={0}>
            <Box flexDirection="row" gap={1} alignItems="center">
              <Text color={failed ? C.bad : C.dim}>{STEP_GLYPH[x.kind] ?? '•'}</Text>
              <Text bold>{name}</Text>
              {target && (
                <Text dimColor wrap="truncate-end">
                  {shortTarget(target)}
                </Text>
              )}
              <Text color={failed ? C.bad : running ? C.run : C.ok}>
                {failed ? `✗ ${x.status === 'failed' || x.status === 'error' ? 'failed' : x.status}` : running ? '⋯' : '✓'}
              </Text>
            </Box>
            {x.kind === 'cmd' && (
              <Box marginLeft={2}>
                {Code ? <Code source={x.text} language="shell" /> : <Text>$ {x.text}</Text>}
              </Box>
            )}
            {x.detail && failed && (
              <Box marginLeft={2}>
                <Text color={C.bad} wrap="wrap">
                  {x.detail}
                </Text>
              </Box>
            )}
            {(x.images ?? []).length > 0 && (
              <Box flexDirection="column" gap={1} marginLeft={2}>
                {(x.images ?? []).map((f, i) => pictureWithOpen(f, 240, `${k}:img:${i}`, x.text))}
              </Box>
            )}
            {x.detail && !failed && x.kind === 'cmd' && (
              <Box flexDirection="column" gap={0} marginLeft={2}>
                <Button key={`b-${outKey}`} plain dimColor label={showOut ? '▾ output' : '▸ output'} onPress={toggle(outKey)} />
                {showOut && (Code ? <Code source={x.detail} /> : <Text dimColor wrap="wrap">{x.detail}</Text>)}
              </Box>
            )}
          </Box>
        )
      }

      // Fixed header and footer: the view is exactly as tall as the pane's
      // window, so the pane itself never scrolls. The mod's `ui.scroll` hook
      // turns the wheel into `back` (blocks scrolled up from the newest), and
      // the timeline draws the blocks ending there, newest at the bottom.
      const shown = blocks.slice(-150)
      const menuKey = `menu:hdr:${s.id}`
      const sendNonce = drafts[s.id] ?? '0'

      return (
        <Box flexDirection="column" gap={1}>
          {/* header */}
          <Box
            flexDirection="row"
            gap={2}
            alignItems="center"
            flexShrink={0}
            paddingX={1}
            paddingY="sm"
            borderStyle="round"
            borderColor={rich ? '#ffffff2e' : undefined}
            backgroundColor={rich ? '#ffffff08' : undefined}
          >
            {backButton}
            {avatar(name, 48)}
            <Box flexDirection="column" gap={0} flexGrow={1} flexShrink={1} minWidth={0}>
              <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                <Text bold>{name}</Text>
                {providerPill(s.provider, s.model)}
                {statusPill(sv)}
              </Box>
              <Text dimColor wrap="truncate-end">
                {ago(s.updatedAt)}
                {s.tokens ? ` · ~${Math.round(s.tokens / 1000)}k tokens` : ''} · {shortPath(s.cwd)}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Button key="hdr-menu" label="⋯" onPress={toggle(menuKey)} />
            </Box>
          </Box>
          {toggles[menuKey] && (
            <Box flexDirection="column" gap={1} flexShrink={0} paddingX={1} borderStyle="round" borderColor={rich ? '#ffffff1f' : undefined}>
              <Input
                key="rename"
                label="Name"
                value={names[s.id] ?? ''}
                placeholder="Give this agent a name"
                submitLabel="rename"
                onSubmit={(value: string) => {
                  const v = value.trim()
                  void saveNames($, n => {
                    const next = { ...n }
                    if (v) next[s.id] = v
                    else delete next[s.id]
                    return next
                  })
                  void update($, togglesA, flag(menuKey, false))
                }}
              />
              <Text dimColor>Session {s.id}</Text>
              <Text dimColor>{s.cwd}</Text>
            </Box>
          )}
          {failed[s.id] && (
            <Box flexShrink={0} paddingX={1} borderStyle="round" borderColor={C.bad} backgroundColor={rich ? C.attention : undefined}>
              <Text color={C.bad}>{failed[s.id]}</Text>
            </Box>
          )}

          {/* timeline: the pane scrolls it (and the header and composer with it);
              opening a session and new activity jump to the newest */}
          <Box flexDirection="column" gap={1}>
            {timeline.length === 0 && <Text dimColor>Loading timeline…</Text>}
            {shown.map(b => {
              if (b.type === 'fold') {
                const key = `fold:${s.id}:${b.i}`
                const isOpen = toggles[key] === true
                const hasFailure = b.items.some(x => x.status && x.status !== 'completed')
                return (
                  <Box key={key} flexDirection="column" gap={0} marginLeft={4} flexShrink={0}>
                    <Button
                      key={`btn-${key}`}
                      plain
                      dimColor
                      label={`${isOpen ? '▾' : '▸'} ${foldLabel(b.items)}${hasFailure ? '  ⚠' : ''}`}
                      onPress={toggle(key)}
                    />
                    {isOpen && (
                      <Box
                        flexDirection="column"
                        gap={1}
                        marginLeft={2}
                        paddingX={1}
                        paddingY="xs"
                        borderStyle="round"
                        borderColor={rich ? '#ffffff14' : undefined}
                      >
                        {b.items.map((x, idx) => stepRow(x, `${key}:${idx}`))}
                      </Box>
                    )}
                  </Box>
                )
              }
              const it = b.item
              if (it.kind === 'turn') return divider(it.text, it.text === 'Turn finished' ? C.ok : undefined)
              if (it.kind === 'user')
                return bubble(
                  'right',
                  <Box flexDirection="column" gap={1}>
                    {it.text !== '' && <Text>{it.text}</Text>}
                    {(it.images ?? []).length > 0 && (
                      <Box flexDirection="row" gap={1} flexWrap="wrap">
                        {(it.images ?? []).map((f, i) => pictureWithOpen(f, 200, `u:${b.i}:${i}`, 'Attached image'))}
                      </Box>
                    )}
                  </Box>,
                  { bg: C.userBubble, border: C.userBorder, when: clock(it.t) },
                )
              if (it.kind === 'image')
                return bubble(
                  'left',
                  <Box flexDirection="column" gap={1}>
                    {(it.images ?? []).map((f, i) => pictureWithOpen(f, 420, `g:${b.i}:${i}`, it.text))}
                    <Text dimColor wrap="wrap">
                      🎨 {it.text}
                    </Text>
                  </Box>,
                  { border: C.agentBorder, when: clock(it.t) },
                )
              const mentioned = (it.images ?? []).length > 0 && (
                <Box flexDirection="row" gap={1} flexWrap="wrap">
                  {(it.images ?? []).map((f, i) => pictureWithOpen(f, 320, `m:${b.i}:${i}`, fileName(f)))}
                </Box>
              )
              if (it.kind === 'note')
                return bubble(
                  'left',
                  <Box flexDirection="column" gap={1}>
                    <Text>{it.text}</Text>
                    {mentioned}
                  </Box>,
                  { bg: C.noteBubble, when: clock(it.t) },
                )
              if (it.kind === 'error')
                return bubble('left', <Text color={C.bad}>{it.text}</Text>, { border: C.bad, bg: C.attention, when: clock(it.t) })
              return bubble(
                'left',
                <Box flexDirection="column" gap={1}>
                  {md(it.text)}
                  {mentioned}
                </Box>,
                { border: C.agentBorder, when: clock(it.t) },
              )
            })}
            {isBusy && (
              <Box flexDirection="row" gap={1} alignItems="center" marginLeft={4} flexShrink={0}>
                {icon(ICON.spinner(C.run), 16, 'working')}
                <Text color={C.run}>{name} is working…</Text>
              </Box>
            )}
          </Box>

          {/* composer, full width, at the end; a new key after each send empties it */}
          <Box flexDirection="column" gap={1} flexShrink={0} width="100%">
            {(attachments[s.id] ?? []).length > 0 && (
              <Box flexDirection="row" gap={1} flexWrap="wrap">
                {(attachments[s.id] ?? []).map((f, i) => (
                  <Box
                    key={`att-${i}`}
                    flexDirection="row"
                    gap={1}
                    alignItems="center"
                    paddingX={1}
                    borderStyle="round"
                    borderColor={rich ? '#ffffff26' : undefined}
                  >
                    {picture(f, 48, fileName(f))}
                    <Text dimColor>{fileName(f)}</Text>
                    <Button
                      key={`att-x-${i}`}
                      plain
                      label="✕"
                      onPress={() => void update($, attachA, m => ({ ...m, [s.id]: (m[s.id] ?? []).filter(x => x !== f) }))}
                    />
                  </Box>
                ))}
              </Box>
            )}
            <Input
              key={`send-${sendNonce}`}
              placeholder={isBusy ? `${name} is busy — wait for this turn to finish` : `Follow up with ${name}…`}
              submitLabel="↵"
              rows={2}
              onSubmit={(value: string) => {
                const images = attachments[s.id] ?? []
                const text = value.trim() || (images.length ? 'See the attached image(s).' : '')
                if (!text || isBusy) return
                void update($, draftsA, d => ({ ...d, [s.id]: String(Date.now()) }))
                void update($, attachA, m => ({ ...m, [s.id]: [] }))
                void sendToAgent($, s, text, name, images).then(() => jumpToNewest($))
              }}
            />
            <Box flexDirection="row" gap={2}>
              <Button key="att-paste" plain dimColor label="📎 Paste image" onPress={() => void pasteImage($, s.id)} />
              <Button key="att-pick" plain dimColor label="🖼 Choose image…" onPress={() => void pickImages($, s.id)} />
            </Box>
          </Box>
        </Box>
      )
    }

    // ── List view ──
    const rows: Row[] = [
      ...claude.map(a => {
        const key = `claude:${a.id}`
        const done = !['running', 'pending', 'waiting'].includes(a.status)
        return {
          key,
          provider: 'claude' as const,
          id: a.id,
          name: a.name ?? a.description,
          status: a.status,
          isBusy: false,
          sub: a.answer ? plainPreview(a.answer) : a.name ? a.description : a.type,
          model: a.model,
          when: a.endedAt,
          isUnread: done && (seen[key] ?? 0) < (a.endedAt ?? 1),
        }
      }),
      ...codex.map(s => {
        const key = `${s.provider}:${s.id}`
        const isBusy = busy[s.id] === true
        const done = !isBusy && !['running', 'pending', 'waiting'].includes(s.status)
        return {
          key,
          provider: s.provider,
          id: s.id,
          name: agentName(s, names),
          status: s.status,
          isBusy,
          failure: failed[s.id],
          sub: plainPreview(s.lastMessage ?? s.lastAction ?? s.title),
          model: s.model,
          when: s.updatedAt,
          isUnread: done && (seen[key] ?? 0) < s.updatedAt,
        }
      }),
    ].filter(r => !hidden[r.key])

    const running = rows.filter(isLive)
    const attention = rows.filter(needsAttention)
    const recent = rows.filter(r => !isLive(r) && !needsAttention(r)).sort((a, b) => (b.when ?? 0) - (a.when ?? 0))
    const unread = rows.filter(r => r.isUnread).length

    const open = async (r: Row) => {
      await markSeen($, r.key)
      await update($, selectedA, () => ({ provider: r.provider, id: r.id }))
      await update($, timelineA, () => [])
      if (r.provider !== 'claude') {
        const s = codex.find(x => x.id === r.id)
        if (s) await refreshTimeline($, s)
      }
      void jumpToNewest($)
    }

    const rowView = (r: Row, tone?: 'attention') => {
      const sv = statusView(r.status, { busy: r.isBusy, failed: r.failure !== undefined })
      return (
        <Box
          key={r.key}
          flexDirection="column"
          gap={0}
          paddingX={1}
          paddingY="xs"
          borderStyle={tone ? 'round' : undefined}
          borderColor={tone ? C.bad : undefined}
          backgroundColor={rich && tone ? C.attention : undefined}
          hover={rich ? { backgroundColor: '#ffffff08' } : undefined}
        >
          <Box flexDirection="row" gap={2} alignItems="center">
            <Text color={r.isUnread ? C.unread : undefined}>{r.isUnread ? '●' : ' '}</Text>
            {avatar(r.name, 44)}
            {/* minWidth 0 + overflow hidden let this column shrink, so a long
                preview line truncates instead of pushing the buttons out. */}
            <Box flexDirection="column" gap={0} flexGrow={1} flexShrink={1} minWidth={0} overflow="hidden">
              <Box flexDirection="row" gap={1} alignItems="center" flexWrap="wrap">
                <Text bold>{r.name}</Text>
                {providerPill(r.provider, r.model)}
                {/* the section already says Running / Recent; only an exception
                    (failed, stalled, waiting, idle) earns a label in the list */}
                {sv.label !== 'Completed' && sv.label !== 'Running' && statusPill(sv)}
                {r.when !== undefined && <Text dimColor>{ago(r.when)}</Text>}
              </Box>
              <Text dimColor wrap="truncate-end">
                {r.failure ?? r.sub}
              </Text>
            </Box>
            <Box flexShrink={0}>
              <Button key={`open-${r.key}`} label="Open" variant="primary" onPress={() => void open(r)} />
            </Box>
          </Box>
        </Box>
      )
    }

    const LIMIT = 5
    const section = (id: string, title: string, list: Row[], headIcon: string, tone?: 'attention') => {
      if (!list.length) return null
      const expanded = toggles[`all:${id}`] === true
      const visible = expanded ? list : list.slice(0, LIMIT)
      return (
        <Box
          key={`sec-${id}`}
          flexDirection="column"
          gap={1}
          paddingX={1}
          paddingY="xs"
          borderStyle="round"
          borderColor={rich ? (tone ? '#f8514955' : '#ffffff1a') : undefined}
        >
          <Box flexDirection="row" gap={1} alignItems="center" justifyContent="space-between">
            <Box flexDirection="row" gap={1} alignItems="center">
              {icon(headIcon, 20, title)}
              <Text bold color={tone ? C.bad : undefined}>
                {title}
              </Text>
              {pill(String(list.length), tone ? C.bad : C.dim, undefined, true)}
            </Box>
            {list.length > LIMIT && (
              <Button
                key={`all-${id}`}
                plain
                label={expanded ? 'Show less' : `View all ${list.length} →`}
                onPress={toggle(`all:${id}`)}
              />
            )}
          </Box>
          {visible.map(r => rowView(r, tone))}
        </Box>
      )
    }

    const tile = (label: string, value: number, body: string, color: string) => (
      <Box
        key={`tile-${label}`}
        flexDirection="row"
        gap={1}
        alignItems="center"
        flexGrow={1}
        paddingX={1}
        paddingY="xs"
        borderStyle="round"
        borderColor={rich ? '#ffffff1a' : undefined}
      >
        {icon(body, 28, label)}
        <Box flexDirection="column" gap={0}>
          <Text dimColor>{label}</Text>
          <Text bold color={value > 0 ? color : undefined}>
            {value}
          </Text>
        </Box>
      </Box>
    )

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="row" gap={1} flexWrap="wrap">
          {tile('Running', running.length, ICON.spinner(C.run), C.run)}
          {tile('Unread', unread, ICON.mail(C.unread), C.unread)}
          {tile('Failed', attention.length, ICON.alert(C.bad), C.bad)}
          {tile('Completed', recent.length, ICON.check(C.ok), C.ok)}
        </Box>
        {section('running', 'Running', running, ICON.play(C.run))}
        {section('attention', 'Needs attention', attention, ICON.alert(C.bad), 'attention')}
        {section('recent', 'Recent', recent, ICON.check(C.ok))}
        {rows.length === 0 && (
          <Text dimColor>No agents in this session yet. Claude subagents and Codex, opencode, Copilot or Antigravity agents started from here show up as they run.</Text>
        )}
        {error && <Text color="error">{error}</Text>}
      </Box>
    )
  })
}
