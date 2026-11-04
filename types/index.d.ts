export type RosterStatus =
  | 'pending'
  | 'running'
  | 'waiting'
  | 'idle'
  | 'completed'
  | 'failed'
  | 'killed'
  | 'stalled'
  | 'unknown'

export type ExternalProvider = 'codex' | 'opencode' | 'copilot' | 'antigravity'

/** A session of an external agent CLI, as scripts/agents-scan.mjs lists it. */
export type ExternalSession = {
  provider: ExternalProvider
  /** what `show` reads: Codex/Copilot log file, opencode session id */
  ref: string
  id: string
  cwd: string
  originator?: string
  model?: string
  title: string
  status: RosterStatus
  lastAction?: string
  lastMessage?: string
  error?: string
  tokens?: number
  startedAt?: string
  updatedAt: number
}

export type ClaudeAgent = {
  id: string
  name?: string
  description: string
  type: string
  status: RosterStatus
  parentId?: string
  /** model it runs on (agent.spawn / turn.complete) */
  model?: string
  /** its last answer (turn.complete) */
  answer?: string
  tokens?: number
  /** when it last finished a turn, ms */
  endedAt?: number
}

export type TimelineItem = {
  t?: string
  kind: string
  text: string
  status?: string
  detail?: string
  /** absolute paths of pictures the step shows: attached, generated, written */
  images?: string[]
}

/** A small preview of a picture (scripts/thumb.py), or why there is none. */
export type Thumb = { mime?: string; data?: string; w?: number; h?: number; error?: string }

/** Who the main prompt box talks to, and how. */
export type TalkState = {
  provider: 'claude' | ExternalProvider
  /** chosen model per provider; '' or absent for its default */
  models: Partial<Record<ExternalProvider, string>>
  /** chosen model family (the part before '/') where a provider has too many models for one list */
  families?: Partial<Record<ExternalProvider, string>>
  /** talkKey(provider, model) → that direct conversation's session id */
  sessions: Record<string, string>
  /** replies go in as messages Claude reads */
  shared: boolean
  autoApprove: boolean
  busy?: boolean
}

export type Selection = { provider: 'claude' | ExternalProvider; id: string } | null

/** A shell command here ran this provider's CLI between `from` and `to` (ms). */
export type Claim = { provider: ExternalProvider; from: number; to: number }

declare module 'claude-code' {
  interface PluginState {
    'outpost': {
      /** external agent sessions of this Claude session (key kept from v0.1) */
      codex: Shaped<ExternalSession[]>
      /** every Claude agent seen this session, finished ones kept */
      claude: Shaped<ClaudeAgent[]>
      /** agent id → model / answer / tokens / end, from engine events */
      claudeMeta: Shaped<Record<string, Pick<ClaudeAgent, 'model' | 'answer' | 'tokens' | 'endedAt'>>>
      selected: Shaped<Selection>
      timeline: Shaped<TimelineItem[]>
      /** lower-cased agent name → 96 px PNG, base64 */
      avatars: Shaped<Record<string, string>>
      /** Codex session id → the name it was given */
      names: Shaped<Record<string, string>>
      /** Codex session id → a follow-up this mod is running */
      busy: Shaped<Record<string, boolean>>
      error: Shaped<string>
      /** when this Claude session first loaded the mod (ms); set once */
      started: Shaped<number>
      /** shell commands here that ran an agent CLI */
      claims: Shaped<Claim[]>
      /** external session ids this mod started */
      owned: Shaped<Record<string, boolean>>
      /** agent key → when the person last opened it (ms) */
      seen: Shaped<Record<string, number>>
      /** Codex session id → the error its last run ended with */
      failed: Shaped<Record<string, string>>
      /** agent keys hidden from the list */
      hidden: Shaped<Record<string, boolean>>
      /** Codex session id → a nonce that changes after each send (empties the box) */
      drafts: Shaped<Record<string, string>>
      /** provider → its logo (96 px PNG, base64), fetched from its own site once */
      logos: Shaped<Record<string, string>>
      /** bundled mascot file name → PNG, base64 (assets/mascots) */
      mascots: Shaped<Record<string, string>>
      /** lower-cased agent name → the mascot file it was given */
      mascotPicks: Shaped<Record<string, string>>
      /** picture path → its preview */
      thumbs: Shaped<Record<string, Thumb>>
      /** external session id → pictures attached to the next follow-up */
      attachments: Shaped<Record<string, string[]>>
      /** who the main prompt box talks to */
      talk: Shaped<TalkState>
      /** provider → models it can run (scripts/agents-scan.mjs models) */
      modelLists: Shaped<Record<string, string[]>>
      /** UI toggles: section expansions, folded groups, open menus */
      toggles: Shaped<Record<string, boolean>>
    }
  }
}
