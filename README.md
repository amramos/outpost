# Outpost

One pane for every coding agent you run from Claude Code.

Outpost is a Claude Code mod that puts your Claude subagents and the agents you run through other CLIs — **OpenAI Codex**, **opencode**, **GitHub Copilot CLI** and **Google Antigravity (`agy`)** — side by side in one pane, so Claude Code can be your only harness while you use every subscription you have.

## What it does

- **One roster.** Running, needs-attention and recent agents in one list, each with a mascot avatar, its provider and model, and a preview of its last answer.
- **Full timelines.** Open any agent to read its session: your messages, its replies (Markdown), its thinking, and every command and tool call folded into tidy, expandable rows.
- **Follow-ups.** Message any external agent from the pane; attach images by pasting from the clipboard or picking files.
- **Pictures inline.** Images an agent generates or mentions show in the conversation, with a button to open them full size.
- **Talk mode.** A band above the prompt box picks a provider and model; your prompts then go straight to Codex, opencode, Copilot or Antigravity instead of Claude. Toggle **Share with Claude** to let Claude read those exchanges, or keep them out of its context.
- **Tools for Claude.** `agent_start`, `agent_send` and `agent_sessions` let Claude start and follow up on external agents itself, which then appear in the pane.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install outpost --marketplace amramos/outpost
```

From a shell:

```bash
claude plugin install outpost --marketplace amramos/outpost
```

In the Claude desktop app (where `/plugin` doesn't run): click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `amramos/outpost`, then **Add plugin**.

Answer `y` to add the marketplace, then pick a scope (user is the default).

## Requirements

- **Claude Code** with mod (plugin hooks module) support.
- **Node.js 22.5 or newer** on your `PATH` (the scanner uses Node's built-in `node:sqlite` to read opencode's database).
- **Python 3 with Pillow** (`pip install pillow`) for avatars, logos and image previews.
- Any of the CLIs you want to use, signed in: `codex`, `opencode`, `copilot`, `agy`. Outpost finds them on your `PATH` (and `agy` in its default install folder).
- Pasting images from the clipboard and the file picker use PowerShell, so they work on **Windows** only for now. Everything else is cross-platform.

## Use

- `/outpost` opens the pane. It also opens by itself at the start of each session.
- `/talk <codex|opencode|copilot|antigravity> [model]` switches the prompt box to another provider; `/talk claude` switches back. The band above the prompt box does the same with pickers.
- `/avatar <name> <image URL or file>` gives an agent your own picture; `/avatar <name>` goes back to its mascot.

Agents started by Claude through Outpost's tools always appear. Codex sessions that Claude Code starts (for example through the Codex plugin) appear too, as do opencode and Copilot runs that a Bash or PowerShell command in the session starts. Antigravity stores its history in a private format, so only Antigravity agents started through Outpost appear.

## How it works

Outpost reads each CLI's own session store, read-only:

| Provider | Where its sessions live |
| --- | --- |
| Codex | `~/.codex/sessions/**/rollout-*.jsonl` |
| opencode | `~/.local/share/opencode/opencode.db` (session, message and part tables only) |
| Copilot CLI | `~/.copilot/session-state/<id>/events.jsonl` |
| Antigravity | logs Outpost keeps of `agy --output-format stream-json`, in `~/.outpost/antigravity/` |

To start or continue an agent it runs that CLI non-interactively (`codex exec`, `opencode run`, `copilot -p`, `agy -p`).

Provider logos are each product's own site icon, fetched once from its official website and cached in the mod's settings. The 30 mascot avatars were made for this mod and ship with it.

## Privacy

Outpost sends nothing anywhere itself: it reads local files and runs the CLIs you already use, which talk to their own services as usual. The only network requests it makes are the one-time logo downloads and any avatar URL you give `/avatar`.

## License

MIT, see [LICENSE](LICENSE).
