# my151 Codex instructions

## Repository and coordination

- Treat the repository root that contains this file as the main my151 repository.
- Keep all code, documentation, tests, screenshots, and Git work inside this repository or its Git worktrees.
- For cloud work, use the checked-out GitHub repository `michael-samoilov/my151` and start from `claude/pokedex-region-builder-AviYF` unless the user names another base.
- Read `CLAUDE.md` before work. It is authoritative for build, deployment, response style, and repository conventions.
- The user-facing task is the coordinator. It is the user's single entry point: accept new work there, delegate bounded implementation or research to workers, monitor them, resolve conflicts, and return one consolidated outcome. Do not make the user chase worker tasks for status or results.
- Apply every instruction in this file to the root agent and every delegated worker. Include the relevant requirements in each worker assignment.

## Coordinator operating protocol

- When a request has independent workstreams or benefits from specialization, start workers immediately. Keep small, tightly coupled work in the coordinator when delegation would add overhead.
- Give each worker a bounded objective, its relevant files or surface, the base branch, and the verification and evidence requirements from this file.
- Post a compact worker ledger in the coordinator chat whenever a worker starts, completes, fails, or needs input. Use one line per worker with: `Worker | Task | Status | Result or next action`.
- Actively follow worker progress. Handle routine questions, retries, and integration yourself; involve the user only for a material product choice, external permission, destructive action, or a review required by the policy below.
- Integrate compatible worker results, run final verification on the combined change, and report the shipped result and evidence in the coordinator chat.
- Never claim a worker is running, finished, verified, or merged unless you have checked its actual state.

## ChatGPT Mobile Remote and cloud workers

- Run the six user-facing coordinator tasks through ChatGPT Mobile Remote on the owner's computer.
- Use the clean coordinator worktree for coordination. Never modify Michael's dirty primary checkout.
- Before new work, fetch GitHub and start an isolated worktree from the latest `origin/claude/pokedex-region-builder-AviYF`.
- Give each feature or fix its own branch and worktree. Never share a working tree between concurrent workers.
- Push a branch before a cloud worker receives it. Every commit, base, and ref in a cloud prompt must exist on GitHub.
- Never use `/cursor/stores`, `/opt/cursor/artifacts`, or another temporary local path as a durable handoff.
- Store durable handoffs in the repository, a GitHub branch or pull request, or the coordinator chat itself.
- If the prompt contains the handoff details, use them. Do not require a missing duplicate file or redo completed work.
- Use Codex Cloud environment `6ab2ececdf948191bc57a7c781fc7b15` for Linux and full browser verification.
- Dispatch with `codex cloud exec --env 6ab2ececdf948191bc57a7c781fc7b15 --branch <pushed-branch> <prompt>`.
- Monitor with `codex cloud status`, inspect with `codex cloud diff`, then apply or integrate the verified result locally.
- Treat desktop GitHub credentials as local-only. Do not assume the cloud worker can push, merge, or read private refs.
- After integration, run the required final checks, push the branch, and use its Vercel preview for review.
- Keep the worker ledger in the coordinator chat. The user must not need to open worker tasks to get status or results.

## 1. Verify before you show

- Run `/verify-my151` on the change. If that command is unavailable, read `.claude/skills/verify-my151/SKILL.md` and follow it.
- If verification fails, fix the cause and run it again until it passes.
- Do not bring work for review while verification still fails.
- For a bugfix, add a test that fails on the old behavior and passes on the fix. Code tests and visual-measurement tests both count.
- Show before-and-after evidence for the same input. If you can check it, never ask the user to verify it.

## 2. Merge low-risk work yourself

- Merge low-risk, already-verified work into `claude/pokedex-region-builder-AviYF` without asking.
- Bring work for review only when it is user-facing or user-affecting, risks data deletion, or is large or ambiguous.
- Follow the detailed deployment tiers and branch-safety steps in `CLAUDE.md`.

## 3. Before and after on mobile and desktop

- For each bugfix or feature with a visual component, capture before-and-after screenshots on desktop and mobile.
- Use the same input in all screenshots.
- Show the old behavior first and the new behavior second.
