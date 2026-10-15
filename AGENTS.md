# my151 Codex instructions

## Repository and coordination

- Treat the repository root that contains this file as the main my151 repository.
- Keep all code, documentation, tests, screenshots, and Git work inside this repository or its Git worktrees.
- For cloud work, use the checked-out GitHub repository `michael-samoilov/my151` and start from `claude/pokedex-region-builder-AviYF` unless the user names another base.
- Favorite Pokémon Picker (`/favorite-pokemon-picker`): the launch is authorized through PR 111 from `claude/jolly-meitner-opefey`. Check current release status before changing it. Before picker work, check out that branch and read `docs/favorite-picker-handoff.md` there.
- League Builder (`/custom-gym-leader`, `/league-card`): the state, rules, and to-do list are in `docs/handoff/league-builder-2026-09-30.md` on production. Read it before league work.
- Pokédex builder (`/pokedex-builder`, the Dex Builder surface): the state, Michael's decisions, and open ideas are in `docs/handoff/dex-builder-2026-09-30.md` on production. Read it before Dex work.
- Admin Dashboard (`/?admin`): the state, open decisions, rules, and to-do list are in `docs/handoff/admin-dashboard-2026-09-30.md` on production, and its verification tools are in `docs/handoff/admin-dashboard-tools/`. Read it before admin work.
- Bugfixes, test-suite health, CI gates, and speed: the state, rules, and to-do list are in `docs/handoff/bugfixes-reliability-2026-09-30.md` on production. Read it before that work.
- Read `CLAUDE.md` before work. It is authoritative for build, deployment, response style, and repository conventions.
- The user-facing task is the coordinator. It is the user's single entry point: accept new work there, delegate bounded implementation or research to workers, monitor them, resolve conflicts, and return one consolidated outcome. Do not make the user chase worker tasks for status or results.
- Apply every instruction in this file to the root agent and every delegated worker. Include the relevant requirements in each worker assignment.

## Coordinator operating protocol

- When a request has independent workstreams or benefits from specialization, start workers immediately. Keep small, tightly coupled work in the coordinator when delegation would add overhead.
- Give each worker a bounded objective, its relevant files or surface, the base branch, and the verification and evidence requirements from this file.
- Post a compact worker ledger in the coordinator chat whenever a worker starts, completes, fails, or needs input. Use one line per worker with: `Worker | Task | Status | Result or next action`.
- Actively follow worker progress. Handle routine questions, retries, and integration yourself; involve the user only for a material product choice, external permission, destructive action, or a review required by the policy below.
- Integrate compatible worker results, run final verification on the combined change, and report the shipped result and evidence in the coordinator chat.

### Checks that outlive a tool connection

- Start long verification jobs in a detached process session. Do not depend on a tool session handle to keep a required check alive.
- Save the source commit, process ID, stage, exit status, logs, and each completed browser-test outcome to disk.
- Write live records outside active Vite/Tailwind source trees. Copy them into repository evidence after the development server stops.
- After an interruption, inspect those records and the live process before restarting. Reuse completed checks when their inputs have not changed.
- Remove an orphan preview server only after checking its process command and working directory. Keep the user's other servers running.
- Continue monitoring through the authorized merge and deployment. A phone or tool reconnect is not a reason to end the task.
- Never claim a worker is running, finished, verified, or merged unless you have checked its actual state.

## Reuse existing UI exactly

- When a tool reuses a feature from another tool, use the existing component implementation. Do not build a separate visual approximation.
- If the existing component needs tool-specific inputs, extend its API or extract one shared implementation used by both tools. Keep data adapters separate from the shared presentation.
- Preserve existing header icons, title styling, navigation, dismissal, shadows, tile borders, spacing and interaction behavior unless Michael explicitly requests a change.
- Compare the reused component in both tools on mobile and desktop with the same relevant states. Verify consistency from the rendered output, not from similar class names.

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
- After integration, run the required final checks and push the branch. Review with pictures in the chat. A work branch builds a Vercel preview only on request: see "Vercel builds" in `CLAUDE.md`.
- Keep the worker ledger in the coordinator chat. The user must not need to open worker tasks to get status or results.

## 1. Verify before you show

- Run `/verify-my151` on the change. If that command is unavailable, read `.claude/skills/verify-my151/SKILL.md` and follow it.
- If verification fails, fix the cause and run it again until it passes.
- Do not bring work for review while verification still fails.
- For a bugfix, prove the fix with a proof test that fails on the old behavior and passes on the fix. Report both results, then delete the test. See section 4, "Testing".
- Show before-and-after evidence for the same input. If you can check it, never ask the user to verify it.

## 2. Merge low-risk work yourself

- Merge low-risk, already-verified work into `claude/pokedex-region-builder-AviYF` without asking.
- Bring work for review only when it is user-facing or user-affecting, risks data deletion, or is large or ambiguous.
- Follow the detailed deployment tiers and branch-safety steps in `CLAUDE.md`.

## 3. Before and after on mobile and desktop

- For each bugfix or feature with a visual component, capture before-and-after screenshots on desktop and mobile.
- Use the same input in all screenshots.
- Show the old behavior first and the new behavior second.

## 4. Testing

These rules apply to every agent and every worker. They exist because agents wrote unit tests that restate the code, never fail, block valid changes, and inflate the codebase.

Write tests in this order:

1. Never write unit tests after you write code.
2. Highly prefer E2E tests (Playwright, `e2e/`) as the sole testing mechanism. Use them to verify that complex features work.
3. At the end of each E2E test, produce a verifiable and repeatable artifact. Attach a screenshot or a JSON measurement with `testInfo.attach`. A second run of the same spec must produce the same result.
4. If you must test a system in isolation, first write down all the ways it could fail. Then write the code. Each unit test names the failure it catches.

Prove each bugfix and feature with a proof test, and then delete it:

1. Before you change the code, write a test that fails on the old code.
2. Make the change, and run the same test again. It must pass.
3. Put both results in the work report or the PR as evidence: the command, the failure, and the pass.
4. Delete the proof test before you commit. Do not keep it in the suite.

Keep a unit test only when it catches a real bug that the E2E tests miss. These areas qualify, because E2E cannot reach them:

- `api/` logic. E2E stubs every API route, so the admin analytics math has no other guard.
- Build and repository gates in `scripts/`, such as `npm run i18n:verify`.
- Saved-data migrations. A bug there deletes a user's saved selections.
- Pure logic with more input combinations than E2E can drive.

Do not write these tests:

- A test that restates the implementation: a constant, a class name, a style value, a formula copied from the source, or an internal data shape.
- A test that repeats an E2E test that already checks the same outcome.

Maintain the suite this way:

- A test that asserts behavior Michael asked to change is stale. Update it. It is not a regression.
- Tag a Playwright test or describe `@viewport` when its result depends on the viewport or device. Untagged tests run only in the `desktop` project. `scripts/check-viewport-tags.mjs` enforces the tag on tests that skip `desktop`.
- `scripts/check-test-rules.mjs` fails on a committed proof test, and on a new unit test outside `api/`, `scripts/`, or saved-data code unless its first 5 lines hold `// keeps: <bug E2E misses>`.
- Run tests by the two-tier rule in `CLAUDE.md`, "Build Verification".
