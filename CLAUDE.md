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

## Style guide

Write all prose in [Google developer documentation style](https://developers.google.com/style). This covers responses, visible thinking, commit messages, PR text, code comments, and docs. The distilled rules are in `.claude/skills/google-style/SKILL.md`. A SessionStart hook in `.claude/settings.json` injects them into context each session. If the hook output is absent, read that file before your first response. For word-level questions, read `word-list.md` in the same directory.

Two boundaries:

- The Response style section wins when the two guides conflict.
- App UI strings and i18n content are out of scope. Game terminology and the `docs/i18n` fixtures stay authoritative there.

## Work reports

End every turn that changes anything with the five-part report in `.claude/skills/work-report/SKILL.md`: Changed, Merge, Verified, Tradeoffs, You test. The SessionStart hook injects the template each session. "Verified" means measured — root-cause tests, or screenshots from the running app — never inferred from code alone. For UI changes, send a before-and-after side by side so review needs no preview deploy. Show the whole screen with the place to look marked on it, never only a crop — see "Showing a defect" in the same file. Any visual change (bugfix, feature, polish) must run `/verify-my151` and show the same input on the old build, then the new build. Paint those shots in the chat. Do not only link PNG paths. Do not ask Michael to retest a change you can drive here. **You test** is `Nothing` unless the hand-off test names a device-only gap.

Before you share a rendered mockup, an image export, or a static page, run the fix loop in `.claude/skills/render-audit/SKILL.md` until a round is clean: render, audit, fix at the source, repeat. A clipped icon, a truncated name, or a label wrapped onto three lines is a defect you find, not one the reviewer points out. When the real app changed, the loop ends with the verify-my151 diff, which runs the same audit on the relevant screens and engines. The clean round belongs under "Verified".

## Build Verification

GitHub Actions is not used. Do not retry Actions. Do not wait for PR checks. The workflow file is `workflow_dispatch` only. Restore `push` / `pull_request` only if billing allows jobs to start.

Michael authorized the CI redesign on 2026-10-16. The commands below replace the
previous 20/40-minute default tiers. Keep verification proportional to the change.

| Command | Scope | Target |
| --- | --- | --- |
| `npm run ci:fast` | All cheap gates, one production build, and critical browser journeys. Use during development. | 3–5 min |
| `npm run ci` or `npm run ci:affected -- --base REF` | Fast checks plus complete owned spec families for changed areas. Use on the final merge candidate. | Usually 5–10 min |
| `npm run ci:full` | All cheap gates, one build, and every existing browser project/spec. Use for launches, high-risk changes, and broad scheduled regression. | Measured separately |

A change to one tuning value, plus its tests and docs, can use `ci:fast` as its
final gate under the existing Tuning exception. It must change no logic, saved-data
shape, API, catalog, dependency, or build configuration. Record that choice.
Public visual changes still follow the approval rules in Deployment.

`bash scripts/ci-local.sh` delegates to affected mode. It accepts `fast`, `affected`,
or `full`, followed by the same options. `--plan` prints the chosen scope and reasons
without running checks. The default base is `origin/claude/pokedex-region-builder-AviYF`;
`--base REF` or `MY151_CI_BASE` overrides it. Missing or unusable history selects full.
A clean diff still runs fast checks. An explicitly known Markdown-only diff skips code checks.

`scripts/ci/policy.ts` owns selection. Unknown files, shared dependencies, APIs,
saved-data stores, build/deploy configuration, dependencies, and CI changes select
full coverage. Tool modules reused by other pages are shared inputs. The selector
includes committed, staged, dirty, deleted, renamed, and untracked paths.

Every code mode runs lint, all unit/API/migration tests, translation verification,
TypeScript, repository guards, analytics-cell verification, and bundle budgets.
The runner builds once with a manifest into its unique Git operational directory.
Browser preview and bundle measurement use that same current-run artifact.
Receipts reject changed source or output. An external preview remains external
evidence; its source identity is not established by a local receipt.

The critical journeys use `@ci-smoke` on existing tests. Keep mobile/narrow
`@viewport` filtering intact. No mode retries a failing browser test into a pass.
CI records failure screenshots and per-case errors. Full Playwright traces are
opt-in for diagnosis (`--trace on --retries 0` on a standalone, locked run);
automatic snapshot tracing slows locator-heavy tests and can cause timeouts.
Keep full regression coverage. Run it explicitly or on a future nightly schedule;
automatic Actions triggers remain disabled until billing allows jobs to start.

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

Each invocation records live status, stage logs, selection, identity, and browser
attempts under `git rev-parse --absolute-git-dir` in `ci-runs/<run-id>`. Inspect
those records and the PID after a reconnect. Completed output is copied to
`.audit/ci/<run-id>` after browser shutdown; `.audit/ci/latest.json` locates it.
Browser-lock wait is recorded separately. The canonical runner acquires the shared
`my151-browser.lock` in the platform temporary directory (`os.tmpdir()`) itself;
do not wrap it in the same lock.

Test rules: read `AGENTS.md` section 4, "Testing", before you write, change, or delete a test. Those rules apply to every agent in this repository. In short: prove a change with a proof test that fails on the old code and passes on the new code, report both results, and do not commit that test. Prefer E2E tests that end with a repeatable artifact. Keep a unit test only when it catches a bug that E2E misses.

`npm run build` is exactly `npm run i18n:verify && tsc -b && vite build`. The `tsc -b` step covers `src`, `api`, `scripts` and `e2e` via the project references in `tsconfig.json` — note that `api/` is Vercel serverless code that Vite never touches, so this typecheck is its only local gate. **Sprite caching is not part of the build**; it is a separate, manual `npm run cache-sprites`.

Vercel runs `npm run build:vercel`: the same build, then `scripts/keep-previous-assets.ts`. On production builds it copies in the `/assets` files of the deploys from the last 7 days (50 MB at most), so a tab opened before a deploy still loads the code it started with. Keep values that change on every deploy out of the JavaScript: one such value renames most chunks (`src/lib/buildVersion.ts`).

`npm run i18n:verify` (`scripts/i18n/verify.ts`) is the deterministic i18n gate. It holds every type name to the string dumped from Scarlet/Violet's own `typename` table, and checks placeholder integrity, untranslated-copy detection, Unicode hygiene, CJK case safety and length budgets. It reads only checked-in files, so it needs no network. Its type-name fixture is `docs/i18n/sources/scarlet-violet-typenames.json`, regenerated by the separate, manual `npm run i18n:game-text` — the *only* step that touches the network, and it is not part of the build.

The other checks, which `scripts/ci-local.sh` also runs:

| Command | Covers |
|---|---|
| `npm run lint` | ESLint. Pre-existing violations are recorded in `eslint-suppressions.json`, so this passes today and any *new* violation fails. Regenerate with `npx eslint . --suppress-all` only when deliberately accepting a new one. **If you *fix* a suppressed violation, run `npx eslint . --prune-suppressions`** — a stale entry exits 2 and fails CI just as loudly as a new violation. |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`, `scripts/**/*.test.ts`). |
| `node scripts/check-viewport-tags.mjs` | Fails when a test that is not tagged `@viewport` skips `desktop`. That test runs in no project. Tag a test or describe `@viewport` when its result depends on the project width or device: a measured box, overflow, wrap, scroll, fit, touch, or a sheet-versus-pane branch. Leave a test untagged when it checks only state, copy, storage, or network, or when it pins its own viewport. |
| `node scripts/check-test-rules.mjs` | Enforces two rules from `AGENTS.md` section 4. It fails on a committed proof test: a test or spec named `proof-*` or `zz-proof*`, or one with a `// proof:` comment. It also fails on a unit test that is new since the merge base with production, unless the test imports `api/` or `scripts/` code, touches saved data (`store`, `persist`, `migrat`), or has `// keeps: <bug E2E misses>` in its first 5 lines. |
| `node scripts/check-sprite-revisions.mjs` | Fails when a file under `public/sprites` was replaced under the same name since production without a matching entry in `src/data/spriteRevisions.json`, or when an entry no longer matches its file. Sprites are cached `immutable` for a year and the service worker keeps them forever, so a replaced file needs a new URL. `src/lib/spriteUrl.ts` adds the entry as `?v=`. The error prints the entry to add. |
| `node scripts/check-speed-test-detection.mjs` | Fails when code a browser or the server runs mentions Lighthouse, PageSpeed, a headless browser, or WebDriver. A page must never serve a speed test something different from what people get. |
| `node scripts/check-bundle-budget.mjs` | Fails when the first-load download of the hub, the Pokédex builder, or the league builder grows more than 5% over its baseline in `scripts/performance/budgets.json`. Text is measured with Brotli, images as emitted, every `srcset` size included. It builds its own copy with a Vite manifest, so `dist/` does not change. After a change that shrinks a page, or an increase that was agreed on, run it with `--rebase` and commit the new baselines. |
| `node scripts/check-published-source.mjs` | Fails when a file under `public/licenses/source/` differs from the source file that `scripts/published-source.json` maps it to, when a published or fenced file is not in the manifest, or when a source file does not start with its license notice. Run it with `--write` to refresh the copies. See "Published license source". |
| `npm run test:e2e` | Standalone full Playwright suite. The canonical CI runner selects its scope. Auto-starts isolated preview and development servers on ports derived from the worktree path. Use `PLAYWRIGHT_PREVIEW_PORT` and `PLAYWRIGHT_DEV_PORT` to override them. Projects: `mobile`, `desktop`, `narrow` (320px). `desktop` runs every test; `mobile` and `narrow` run only `@viewport` tests. Specs under `e2e/sweeps/` drive their own viewports and run only in `desktop`. |

Against a Vercel preview, skip the local web servers. A preview builds only on request (see "Vercel builds"):

```bash
PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app bash scripts/ci-local.sh
```

The canonical runner keeps its local gates, then records external browser evidence. It drops the `dev` project, which needs `PREVIEW_FEATURES`. Standalone `e2e/preview.config.ts` retains its existing behavior.

Speed changes: prove a change meant to make the app faster with `node scripts/performance/lighthouse.mjs` and `node scripts/performance/lab.mjs`. Both build production and your working tree. `lighthouse.mjs` runs PageSpeed Insights' engine on every page, lists the findings, and fails a change that only games the score (see "Guards" in `docs/performance.md`). `lab.mjs` prints LCP, blocking time, and per-step INP. Paste both tables into the pull request. `node scripts/performance/psi.mjs` reads what Google's PageSpeed Insights shows for the live site, field data included. It needs `PAGESPEED_API_KEY` in the environment settings: the one Google key Michael approved, restricted to PageSpeed Insights. Never print, log, or commit it. Timing is noisy on a shared machine, so the script is evidence, not a ci-local gate. Michael's bar for merging a speed change: it must not hinder the user experience, and it must not overly complicate the code. Prefer the smallest diff that removes the measured cause. A speed change that users can see (content that appears later, a placeholder, a new animation) is a visual choice: show Michael before and after first. The speed targets, and the ideas already tried and left out, are in `docs/performance.md`. Read it before you start speed work.

One browser run at a time on a machine: `lab.mjs` takes the lock itself. The canonical CI runner also takes the lock itself. Wrap standalone browser commands in `flock "${TMPDIR:-/tmp}/my151-browser.lock" <command>`, so a Playwright run never overlaps a lab run.

The local `npm run build` is the compile check. Visual review is whole-screen mobile (~390px) and desktop (~1280px) screenshots, with before/after when the view already existed. Use live admin data, not demo fixtures.

### Vercel builds

Builds are most of the Vercel bill. Michael set these rules on 2026-10-09.

- `scripts/vercel-ignore-build.sh` is Vercel's Ignored Build Step (`ignoreCommand` in `vercel.json`). On production, it skips a push that changes only docs, tests, or agent tooling. On every other branch, it skips the build unless the branch name starts with `preview/` or the commit message contains `[preview]`. When it is unsure, it builds.
- Ask for a preview only when someone needs a live URL: response headers, redirects, the `api/` functions, or a link that Michael asked for. Pictures in the chat are the review.
- Never push an experiment to production to measure it. Measure with `lighthouse.mjs` and `lab.mjs` locally, then merge the result.
- Batch production merges. Each code merge is a full build of about 66 seconds.
- When the site build starts to read a file under a path that the script skips, remove that path from the script's skip list.

## Published license source

Michael set these rules on 2026-10-12.

1. Never release our own code under an open-source license, and never publish its source.
2. Keep code whose license makes us publish its source, such as MPL-2.0, in files of its own. Put none of our code in those files. Our code imports from them.
3. Publish each such file unchanged as `public/licenses/source/<project>/<file>.txt`. The site serves it at `https://my151.app/licenses/source/<project>/<file>.txt`.
4. Link each published file from the project's Acknowledgements entry and from its section in `THIRD_PARTY_NOTICES.md`.
5. List each file in `scripts/published-source.json`. `node scripts/check-published-source.mjs` enforces the list, and `scripts/ci-local.sh` runs it.

Do not copy code under a license that covers the whole work, such as GPL-3.0. Fencing does not help there: rewrite the feature without that code.

## Deployment

**The app has real users. `claude/pokedex-region-builder-AviYF` is production.**

Do not wait for Michael to ship low-risk, already-verified work. Merge it to `claude/pokedex-region-builder-AviYF`.
The approval rule keeps an untested change that **end users** see out of the live app.
Judge the change by what it does, not only by which folder the files sit in.

Before every production push, run canonical affected CI on the final merge candidate under Build Verification. GitHub Actions is not the deploy signal. Ignore a 2–3s red X. Vercel Ready is the deploy signal. A build that Vercel marks Canceled by the Ignored Build Step is a skip, not a failure.

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

This repo vendors [pstack-claude](https://github.com/michael-denyer/pstack-claude)
version 0.9.84. The complete upstream distribution lives in
`.claude/vendor/open-pstack/upstream/`. Skills and agents link to that snapshot.
Codex discovers the same skills through `.agents/skills`.
Provenance, local deviations, and resync steps are in
`.claude/vendor/open-pstack/README.md`.

Use `/poteto-mode` for non-trivial work. The Claude SessionStart hook loads its
routing instruction. Enter `/how`, `/architect`, `/interrogate`, `/tdd`, or
`/deslop` directly when the task already fits that skill.

Upstream plugin names use the `pstack:` prefix. This checkout exposes bare
skill and agent names. Resolve `pstack:poteto-mode` as `poteto-mode` and
`pstack:effort-high` as `effort-high`. Apply this mapping to every plugin skill
and agent reference. The routing hook applies it to its own output.

`/setup-pstack` configures models for the current runtime. The latest upstream
uses native model defaults, optional external providers, and per-role effort.
Do not reuse the previous distribution's provider-qualified model sheet without
following the updated setup instructions. This update does not change personal
model sheets or probe provider accounts.

This file and direct user instructions take precedence over pstack.
pstack does not change Deployment or this repository's verification rules.
Run `node scripts/check-pstack.mjs` to check the upstream snapshot and active
skill and agent links. The upstream tests run separately from app tests.

## Responsive sizing

The app targets mobile (≤1023px) and desktop (≥1024px, the `md:` breakpoint) as **peers, not mobile-with-desktop-patches**. When auditing or adding responsive code, design for both from the start rather than starting from mobile and bolting on `md:` overrides. Two things follow:

- **Layout shape can differ across the breakpoint** when the platform benefits — grid column counts, sheet-vs-pane, horizontal-vs-vertical stacks. Pick the shape that reads best at each width. Example: the type filter is 3×6 on mobile and 6×3 on desktop (`PokemonBrowser.tsx`); analytics drilldowns are a bottom-sheet on mobile and a side-pane on desktop.
- **Proportions within a shape scale together.** Text, icons, sprites, chart geometry, and paddings grow proportionally — it is not OK for only text to grow on desktop while icons and chart heights stay pinned to mobile constants.

Two sizing knobs are authoritative:

1. **Root `font-size`** (`src/lib/layoutFontSize.ts`, installed from `src/main.tsx`) drives all rem-based Tailwind utilities (`text-xs`, `p-2`, `gap-3`, …). It's JS-computed — **not CSS `vw`** — because iOS ties CSS `vw` to the visual viewport, so CSS clamps shrink the entire UI during pinch-zoom. The JS version un-zooms via `devicePixelRatio / BASE_DPR` (same pattern as `usePixelPerfectSprite`).
2. **Container-relative clamps** drive data viz and tile internals:
   - Tile internals use `--tile-sprite` (set inline on each tile root), with child sizes as `calc(var(--tile-sprite) * N)`. See `EvoLineCard.tsx` and `PokedexGrid.tsx`.
   - Charts use `chartScale = max(1, min(width / 360, 2))` from a container `ResizeObserver`, multiplying all geometric constants (row heights, icon sizes, label heights). See `ButterflyChart.tsx`, `SuperimposedHistogram.tsx`, mekko chart block in `AnalyticsDashboard.tsx`.

Avoid re-introducing per-site `text-[clamp(…vw…)]` or paired `md:` hardcoded sizings — they bypass both knobs, create drift, and re-expose the iOS pinch-zoom shrink bug.
