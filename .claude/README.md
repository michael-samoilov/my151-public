# Agent configuration

AI coding agents (Claude Code, Codex, and Cursor) build this project under the
owner's direction. This folder holds the instructions and tools they share. The
project-wide rules are in [`CLAUDE.md`](../CLAUDE.md) and
[`AGENTS.md`](../AGENTS.md) at the repository root.

| Path | What it holds |
| --- | --- |
| `skills/` | Playbooks that agents load for a task. For example, `verify-my151` drives the app in three browser engines, and `render-audit` checks rendered pages for clipped or overflowing content. |
| `rules/` | Area rules that load only when an agent works on matching files. |
| `hooks/` | Scripts that run around agent tool calls: a lint and type check before every push, and a guard that stops the owner's email address from reaching outside services. |
| `agents/` | Subagent definitions for code review and for effort levels. |
| `vendor/` | A third-party skill pack (pstack, MIT license), kept as its upstream publishes it. |
| `settings.json` | Which hooks run and which commands agents may run without asking. |
