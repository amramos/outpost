# Changelog

All notable changes to Outpost. Versions follow [semantic versioning](https://semver.org); the version is the `version` in `.claude-plugin/plugin.json`.

## 0.2.0 — 2026-11-04

### Added
- Screenshots in the README: the roster, an agent's session and talk mode.
- This changelog.

### Changed
- The talk picker lists only the provider CLIs found on the machine (plus Claude).
- The picture helpers (avatars, logos, image previews) use the first of `python`, `python3` and `py -3` that has Pillow, so they work on macOS and Linux too. Without one, everything but pictures still works, and `/avatar` says what to install.

### Fixed
- GitHub Copilot CLI installed with npm on Windows is now found (npm leaves only a `copilot.cmd` shim; Outpost runs the package's `npm-loader.js` with Node).

## 0.1.0 — 2026-11-04

First release.

- One pane for Claude subagents and Codex, opencode, GitHub Copilot CLI and Antigravity (`agy`) agents, with mascot avatars, provider logos, models and last answers.
- Full session timelines: messages as Markdown, thinking, and commands and tool calls folded into expandable rows.
- Follow-ups from the pane, image attachments (clipboard paste and file picker on Windows), and pictures shown inline.
- Talk mode: a band above the prompt box sends your prompts to another provider and model, with **Share with Claude** and **Auto-approve tools** toggles; `/talk` does the same from the keyboard.
- Tools for Claude: `agent_start`, `agent_send`, `agent_sessions`.
