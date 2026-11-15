# CLAUDE.md

## Context Resumption

When resuming from a context summary (e.g. after running out of context), only act on items explicitly listed under "Pending Tasks." Do not revisit, verify, or re-investigate completed work. Treat the summary's completed items as done — pick up exactly where things left off.

## Response style

Write in ASD-STE100 Simplified Technical English where the subject allows. Also follow the `action-first-replies` rules (a skill by Ayoub Ghriss (github.com/ayghri)).

Simplified Technical English:

1. Write one instruction per sentence. Use 20 words maximum for an instruction, 25 for a description.
2. Use active voice and present tense. Do not use a gerund when a simple verb works.
3. Give each word one meaning. Do not add a synonym for variety.
4. Use 6 sentences maximum per paragraph.
5. Do not use idiom, metaphor, or figurative language.

Full STE compliance needs the approved-word dictionary, which is proprietary and not available here. Apply the sentence and grammar rules above. Do not claim dictionary compliance.

`action-first-replies`:

1. Lead with the action. Write no preamble and no closing pleasantry.
2. Number the steps when work has more than one step. Put one action in each step.
3. Give a specific time estimate. Do not write "a bit" or "shortly".
4. Use 5 items maximum per list. Split a longer list into "now" and "later".
5. State an error and its fix directly. Restate the current state each turn.

The five rules are the summary. The full rule set is vendored at `.claude/skills/action-first-replies/SKILL.md` (MIT, by Ayoub Ghriss). The SessionStart hook injects it each session.

Never drop these as tangents or preamble:

- A request for approval before merging public product UI, data-destruction, or a large or ambiguous product change (see Deployment).
- A correction to an earlier statement that was wrong.
- A defect or risk found in the work, including my own.

Both source documents list the same exception: confirmation of a risky action, and real ambiguity, outrank brevity.

Decisions for Michael:

- Show every alternative of a live product, layout, or design decision as a picture: screenshots, a mockup, or a rendered comparison, side by side, with the same input. A text-only list of options is not a decision request.
- Under each alternative, state the facts that differ, and give your recommendation.
- For a decision with no visual side, such as closing a PR, give the context, the alternatives, their consequences, and your recommendation.
- Name each open decision by what it decides, in plain words, every time you mention it. Never use a code such as "D6" or "D1 to D5" in a message to Michael. Say where its context is: pictures in this chat, or a GitHub link to the file section that explains it.

## Personal data

Never send Michael's email address or other contact details to an outside service. This rule covers request headers such as `User-Agent`, URLs, query strings, form fields, and payloads. It also covers commit messages, PR and issue text, and subagent briefs. Send the address only when Michael approves that exact use in the conversation.

When a site asks for contact details in a user agent, send a generic tool name with no contact details. If the site refuses that request, skip the site.

`.claude/hooks/guard-owner-email.mjs` enforces this rule. It runs before every tool call and compares each email address in the call with stored SHA-256 hashes. On a match, Claude Code asks Michael for approval, also in auto mode. An agent that cannot show the prompt is denied. The repository stores only the hashes, never the address. The public copy holds a placeholder hash instead.

## Style guide

Write all prose in [Google developer documentation style](https://developers.google.com/style). This covers responses, visible thinking, commit messages, PR text, code comments, and docs. The distilled rules are in `.claude/skills/google-style/SKILL.md`. A SessionStart hook in `.claude/settings.json` injects them into context each session. If the hook output is absent, read that file before your first response. For word-level questions, read `word-list.md` in the same directory.

Two boundaries:

- The Response style section wins when the two guides conflict.
- App UI strings and i18n content are out of scope. Game terminology and the `docs/i18n` fixtures stay authoritative there.

## Rules live in checks

Michael set this standard on 2026-11-02. An agent can miss a written rule. A failing check stops the change.

1. When you fix a bug, or when Michael corrects an agent, add a check that fails on the old code.
2. Use the first level that works: an architecture or type change that makes the mistake impossible, an ESLint rule, a repository check script, then a test.
3. Add a source-code rule to `WRITTEN_RULES` in `scripts/eslint/writtenRules.mjs`. Give the rule text, its source document, the files, the AST selectors, and the fix. The lint error shows all of them.
4. Add a bad sample and a good sample for the rule to `scripts/eslint/writtenRules.test.ts`. The test fails when a rule has no sample, or when a sample gives the wrong result.
5. Fix existing violations in the same change. When a fix needs its own review, record it with `npx eslint <file> --suppress-rule written/<id> --suppressions-location eslint-suppressions.json`, and report it as open work.

Write a prose rule only for a judgment that no check can make. The `/correct` skill runs this process over past mistakes.

Code comments are banned. `my151/no-comments` in `scripts/eslint/plugin.mjs` fails every comment except tool directives and one line of `// platform: <reason>`. Use the platform tag only for behavior that a browser, a vendor, or a protocol forces on us. Say everything else with a name, a type, or a test. `npx eslint --fix` deletes a banned comment.

## Work reports

End every turn that changes anything with the five-part report in `.claude/skills/work-report/SKILL.md`: Changed, Merge, Verified, Tradeoffs, You test. The SessionStart hook injects the template each session. "Verified" means measured — root-cause tests, or screenshots from the running app — never inferred from code alone. For UI changes, send a before-and-after side by side so review needs no preview deploy. Show the whole screen with the place to look marked on it, never only a crop — see "Showing a defect" in the same file. Any visual change (bugfix, feature, polish) must run `/verify-my151` and show the same input on the old build, then the new build. Paint those shots in the chat. Do not only link PNG paths. Do not ask Michael to retest a change you can drive here. **You test** is `Nothing` unless the hand-off test names a device-only gap.

Before you share a rendered mockup, an image export, or a static page, run the fix loop in `.claude/skills/render-audit/SKILL.md` until a round is clean: render, audit, fix at the source, repeat. A clipped icon, a truncated name, or a label wrapped onto three lines is a defect you find, not one the reviewer points out. When the real app changed, the loop ends with the verify-my151 diff, which runs the same audit on the relevant screens and engines. The clean round belongs under "Verified".

## Build Verification

In this repository, GitHub Actions runs on demand only (`workflow_dispatch`). Do not rely on Actions: do not retry it, and do not wait for PR checks. `.github/workflows/public-ci.yml` runs on push only in the public copy.

Michael chose "verify, ship, then run" on 2026-11-08. A change is verified by the
cheap gates and the browser tests that run its files. It ships through a smoke test
of the staged deploy. The full browser suite runs after release, not before it.

| Command | Scope | Target |
| --- | --- | --- |
| `npm run ci` | All cheap gates, one build, the `@ci-smoke` journeys, and the browser specs that the test map says run the changed files. Use on every merge candidate. | 2–5 min |
| `npm run ci:fast` | All cheap gates, one build, and the `@ci-smoke` journeys. | 2–3 min |
| `npm run ci:full` | Every browser spec in every project. Runs after release and every night. Run it before release only for a launch or a risky change. | About 30 min |
| `npm run ci:full -- --record-map` | `ci:full` that also rewrites `scripts/ci/test-map.json`. The nightly run uses it. | About 35 min |

A change to one tuning value, plus its tests and docs, can use `ci:fast` as its
final gate under the existing Tuning exception. It must change no logic, saved-data
shape, API, catalog, dependency, or build configuration. Record that choice.
Public visual changes still follow the approval rules in Deployment.

A Claude Code hook, `.claude/hooks/pre-push-checks.mjs`, runs lint and the type
check before every `git push`. It blocks the push when either fails. It reuses the
CI caches, so a repeat check takes about 2 seconds. Other agents and people run
`npm run ci:pre-push` before they push.

The critical journeys use `@ci-smoke` on existing tests. Keep mobile/narrow
`@viewport` filtering intact. No mode retries a failing browser test into a pass.
CI records failure screenshots and per-case errors. Full Playwright traces are
opt-in for diagnosis (`--trace on --retries 0` on a standalone, locked run);
automatic snapshot tracing slows locator-heavy tests and can cause timeouts.
The full suite runs after every release and every night (see Deployment). A red
nightly run is the next task: fix the cause, or roll back the release that caused it.
Actions has no automatic trigger in this repository.

Visual changes require the relevant before/after mobile and desktop screenshots.
Use verify-my151 with selected `--screens` and relevant `--surfaces` when the
change needs visual or native-engine evidence. Platform changes require the
actual affected engine. The exhaustive all-screen/all-engine matrix is separate
full/release QA; ordinary changes do not add it automatically. API/auth and
saved-data checks remain mandatory. Approval and data-deletion protections remain.

Batch final verification after design approval. Do not run broad checks while
Michael reviews a design. Fix failed checks and rerun the affected check. A
failure reproduced on production HEAD is pre-existing evidence, not a passed run.
A test that passes only on retry remains a flaky failure to repair.

### Keep final verification proportional

Michael explicitly authorized skipping or changing disproportionate checks on
October 16, 2026. A verification-infrastructure change can use runner/selection
proofs and `ci:fast` as its final gate. It does not need every application browser
scenario. Record the scope decision. All cheap API, migration, type, build, and
repository gates remain mandatory.

Reuse passed stages and a validated build when their inputs have not changed.
When production advances, check the incoming changes and their existing evidence,
then verify the actual integration risk. Do not automatically restart exhaustive
regression. Build changed application inputs once and run critical journeys plus
the relevant changed-area checks. A recorded scope decision can override the
selection.

Stop after the relevant risk is covered. Do not turn final verification into
another release audit or expand a repair to adjacent passing behavior. Preserve
failed or interrupted outcomes honestly when a redundant run is stopped.

If you fix a lint violation that `eslint-suppressions.json` records, run `npx eslint . --prune-suppressions`. A stale entry fails CI.

Do not commit or edit files while a CI run is in progress. Its receipt rejects changed source, and the run fails at the end.

Test rules: read `AGENTS.md` section 4, "Testing", before you write, change, or delete a test. Those rules apply to every agent in this repository. In short: prove a change with a proof test that fails on the old code and passes on the new code, report both results, and do not commit that test. Prefer E2E tests that end with a repeatable artifact. Keep a unit test only when it catches a bug that E2E misses.

One browser run at a time on a machine: `lab.mjs` takes the lock itself. The canonical CI runner also takes the lock itself. Wrap standalone browser commands in `flock "${TMPDIR:-/tmp}/my151-browser.lock" <command>`, so a Playwright run never overlaps a lab run.

The local `npm run build` is the compile check. Visual review is whole-screen mobile (~390px) and desktop (~1280px) screenshots, with before/after when the view already existed. Use live admin data, not demo fixtures. Open the live site only as AGENTS.md, "Visits to the live site", says, so agent visits never count as users.

### Area rules

These files under `.claude/rules/` load in Claude Code only when you work on matching paths. Read the file before work in its area.

- `ci-runner.md`: CI runner internals, test selection, run records, and every repository check. Read it before you change `scripts/ci/`, a check script, `e2e/`, or the lint setup.
- `build-pipeline.md`: what `npm run build`, the Vercel build, and `npm run i18n:verify` do. Read it before you change the build, TypeScript, or i18n setup.
- `speed-work.md`: how to prove a speed change. Read it before any work meant to make the app faster.
- `responsive-sizing.md`: the mobile and desktop sizing model. Read it before you change layout, sizing, or chart geometry in `src/`.
- `published-license-source.md`: how to keep and publish code under a source-publishing license. Read it before you add a dependency or copy third-party code.

### Vercel builds

Builds are most of the Vercel bill. Michael set these rules on 2026-10-09.

- `scripts/vercel-ignore-build.sh` is Vercel's Ignored Build Step (`ignoreCommand` in `vercel.json`). On production, it skips a push that changes only docs, tests, or agent tooling. On every other branch, it skips the build unless the branch name starts with `preview/` or the commit message contains `[preview]`. When it is unsure, it builds.
- Ask for a preview only when someone needs a live URL: response headers, redirects, the `api/` functions, or a link that Michael asked for. Pictures in the chat are the review.
- Never push an experiment to production to measure it. Measure with `lighthouse.mjs` and `lab.mjs` locally, then merge the result.
- Batch production merges. Each code merge is a full build of about 66 seconds.
- When the site build starts to read a file under a path that the script skips, remove that path from the script's skip list.

## Deployment

**The app has real users. `claude/pokedex-region-builder-AviYF` is production.**

Do not wait for Michael to ship low-risk, already-verified work. Merge it to `claude/pokedex-region-builder-AviYF`.
The approval rule keeps an untested change that **end users** see out of the live app.
Judge the change by what it does, not only by which folder the files sit in.

Before every production push, run `npm run ci` on the final merge candidate. GitHub Actions is not the deploy signal. Ignore a 2–3s red X. A build that Vercel marks Canceled by the Ignored Build Step is a skip, not a failure.

### Release: verify, ship, then run

Production builds are staged. Vercel builds each push to `claude/pokedex-region-builder-AviYF`, but my151.app keeps serving the previous deploy until someone promotes the new one. Promotion does not rebuild. Release each production push like this:

1. Find the deploy. Call the Vercel MCP `list_deployments` with the pushed commit `sha`, and wait until its state is `READY`. Project `<vercel project id>`, team `<vercel team id>`.
2. Smoke it. Run `npm run release:smoke -- <deployment url>`. It opens each public page of that exact deploy, read-only and opted out of analytics. A failure means do not promote: fix forward and push again.
3. Promote it. Call `request_promote` with that deployment id.
4. Confirm it. Run `npm run release:live -- <build stamp>`, with the stamp that step 2 printed. It waits until my151.app serves that build.
5. Run the full suite. Start `npm run ci:full` in the background on the released commit, and report its result. When it finds a defect that the release caused, roll back with `request_promote` on the previous production deploy, then fix forward.

A push that the Ignored Build Step skips has nothing to release. A later promote releases every earlier commit too, because production is cumulative. To undo a release, promote the previous deploy; on Pro, any earlier production deploy can be promoted again.

After every production push, check out the work branch again. A merge leaves you on production, so the next commit would land there. Run `git rev-parse --abbrev-ref HEAD` before any later commit.

### Merge to production without asking

After the checks pass, merge into `claude/pokedex-region-builder-AviYF` and push. Do this as the last step of the work. Do not ask. Do not stop at the work branch. Report the merge in the work report.

Ship without asking when the change is:

- Docs, tests, scripts, `.claude/`, `.github/`, or other files a browser never receives.
- Admin dashboard (`/?admin`) copy, counts, or small layout, when you already have a measured before/after or a test that failed then passed.
- Internal refactors, types, and dead-code removal with no user-noticeable behavior.
- A public-UI bugfix that restores the intended behavior and changes no design, when targeted `/verify-my151` evidence proves it on the relevant screens and engines. Report it with that evidence.
- A public-UI change whose outcome Michael already decided, under the gate in "Decided by Michael".

### Decided by Michael

Michael set this rule on 2026-10-08. Merge public UI without asking when Michael already decided the outcome: he gave the exact copy, picked an option from pictures, or described the fix. All of these must hold:

1. A proof check fails on the old build and passes on the new build.
2. The targeted `/verify-my151` diff has 0 regressions on the relevant screens and engines.
3. The visual diff shows changes only in the regions the change intends. The `/verify-my151` diff writes it as `visual.json` and `visual.png` in its evidence folder.
4. The selected fast/affected/full checks pass.

Before you code, write two short lists in your notes: what must change, and what must not change. The proof check tests the first list. The visual diff tests the second. Every changed region in the visual diff must belong to the first list; explain each one in the work report.

Report the merge with before-and-after pictures, so Michael can ask for a revert. Ask first only for open choices: no option picked, a new feature, or a visual diff with a change you cannot explain.

Admin is not public product UI. A verified admin Dex-chip count ships. A verified admin layout tweak ships.

### Ask first

Ask in the current conversation before you merge when any of these apply:

1. **Public product UI that needs Michael's judgment.** A new feature, a new look that Michael did not specify, or a choice between visual options that he has not picked, in the pokedex builder, league builder, or export that end users see. A bugfix that `/verify-my151` proves is not this. A change whose outcome Michael already decided, and that passes the gate in "Decided by Michael", is not this. Admin `/?admin` copy, counts, or small verified layout is not this.
2. **Data destruction or irreversible writes.** Deletes, schema drops, token or credential changes, anything a revert does not undo.
3. **Large or ambiguous product changes.** Unclear scope, or a change big enough that Michael should see it first.

When you are unsure, ask. A work-branch push costs nothing: it builds no preview.

Work an ask-first change like this:

1. Commit to the work branch and push it (`git push -u origin <work-branch>`). Verify with `/verify-my151`. Vercel builds no preview unless you ask for one (see "Vercel builds").
2. Report the change. For a visual change, show the review in the chat thread itself: before-and-after screenshots or a video, on mobile (about 390px) and desktop (about 1280px), for the same input. When you offer options, show the after state of each option. Michael reviews on a phone and does not open file paths or previews for this.
3. Do not merge to production until Michael says to ship it.
4. After he says to ship it, merge into and push `claude/pokedex-region-builder-AviYF`.
5. Check out the work branch again immediately after that push.

**Check whether a change is user-visible before calling it invisible.** `theme-color` tints mobile browser chrome. Markup inside `#root` renders until React mounts. The app runs in **light** mode. The `.dark` block in `index.css` exists, but nothing applies the class, so dark-themed additions mismatch the live UI.

## Cursor Cloud specific instructions

Development happens through Cloud Agents, often from the mobile Cursor app. Two consequences follow.

- **Do not verify on localhost.** The mobile client cannot reach the agent's `localhost`, so a running dev server is not evidence a reviewer can see. Verify with the `verify-my151` harness (`.claude/skills/verify-my151`, three engines). Build a Vercel preview only when a live URL is needed (see "Vercel builds"). Capture screenshots or recordings as walkthrough artifacts.
- **The Cloud Agent environment arrives ready.** Its build bakes in dependencies and all three browser engines (Blink, WebKit, Gecko). `npm ci`, `npx playwright install chromium`, and the verify-my151 engine setup run at build time, so a booted agent can build, test, and drive browsers without setup. `npm run test:e2e` and the verify-my151 harness each start their own servers, so neither needs the `start` dev server.

## pstack

This repository vendors pstack-claude, a third-party MIT skill set. Before you
change the vendored files or the pstack setup, read `.claude/rules/pstack.md`.

Use `/poteto-mode` for non-trivial work. The Claude SessionStart hook loads its
routing instruction. Enter `/how`, `/architect`, `/interrogate`, `/tdd`, or
`/deslop` directly when the task already fits that skill.

Upstream plugin names use the `pstack:` prefix. This checkout exposes bare
skill and agent names. Resolve `pstack:poteto-mode` as `poteto-mode` and
`pstack:effort-high` as `effort-high`. Apply this mapping to every plugin skill
and agent reference. The routing hook applies it to its own output.

Two pstack names differ in this repository. Where pstack names `main` or trunk
as a diff or PR base, use `claude/pokedex-region-builder-AviYF`. Where it names
the project `verify` skill at `.claude/skills/verify/`, use `verify-my151`.

This file and direct user instructions take precedence over pstack.
pstack does not change Deployment or this repository's verification rules.

