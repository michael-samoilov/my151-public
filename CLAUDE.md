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

Before you share a rendered mockup, an image export, or a static page, run the fix loop in `.claude/skills/render-audit/SKILL.md` until a round is clean: render, audit, fix at the source, repeat. A clipped icon, a truncated name, or a label wrapped onto three lines is a defect you find, not one the reviewer points out. When the real app changed, the loop ends with the verify-my151 diff, which runs the same audit on the surfaces of the change's production tier. The clean round belongs under "Verified".

## Build Verification

GitHub Actions is not used. Do not retry Actions. Do not wait for PR checks. The workflow file is `workflow_dispatch` only. Restore `push` / `pull_request` only if billing allows jobs to start.

Every work-branch push runs the work-branch checks. A production merge adds the checks of its risk tier, chosen by what the change touches. Michael set these tiers on 2026-10-07, so the checks stay in proportion to the fix. They supersede check steps in older handoff files.

| Production tier | When | Run before the merge | About |
|---|---|---|---|
| Small | One tool and a few files. No saved data, store, API, analytics write, i18n catalog, build config, dependency, or component that another tool also uses. | The work-branch checks, the repo guards (`check-viewport-tags`, `check-test-rules`, `check-sprite-revisions`, `check-speed-test-detection`, `check-bundle-budget`), the proof test, and the specs for the changed area. A visual change adds `/verify-my151` diff with `--surfaces blink`. | 6 min |
| Standard | Shared code, or a change that more than one tool shows. | `bash scripts/ci-local.sh` once, on the merged result. A visual change adds `/verify-my151` diff with `--surfaces blink,blink-ios-safari`. | 20 min |
| Full | Saved-data shape or migration, a store, an API or analytics write, build or deploy config, a dependency upgrade, or a launch. | `bash scripts/ci-local.sh` once, on the merged result. A change that reaches the browser bundle adds `/verify-my151` diff on all engines. A server-only change does not: the harness serves a build whose API calls fail, so it cannot observe the change. | 40 min |
| Admin | Every changed file is admin-only: the command below prints nothing. This covers the admin page and its read-only API code. Michael set this tier on 2026-10-08. | `npm run lint`, `npm test`, `node scripts/check-test-rules.mjs`, the proof test, and `flock /tmp/my151-browser.lock npx playwright test e2e/admin- --project=desktop --project=mobile --project=narrow`, which builds first. A visual change adds 390 and 1280 px before-and-after shots on live data. | 3 min |

Admin work speed (Michael, 2026-10-08): a small admin-only change takes 10 minutes or less from request to production. The Admin tier checks and plain before-and-after shots on live data are the whole evidence. Do not add render-audit loops, side-by-side composites, alternative layouts, or assessments of other surfaces unless Michael asks for them. The coordinator makes a small admin change itself instead of starting a worker, and gives a worker only admin tasks that take more than about 30 minutes.

The Admin tier check. Any printed file is outside the admin surface, so the change takes another tier:

```bash
git diff --name-only origin/claude/pokedex-region-builder-AviYF...HEAD | grep -v -E '^(src/components/admin/|e2e/admin-|docs/)|\.md$|^src/lib/(usageFunnels|sankey[A-Za-z]*|whoOrigin|searchPerformance[A-Za-z]*|crossTool[A-Za-z]*|dashboardRange|aggregate|platformStacks)\.|^api/(_dashboard|_crossTool|_range|_searchPerformance|_archive|_aggregate|_favoriteAggregate|submissions|search-performance|feedback-list|journal|archive-entry)\.ts$'
```

When unsure, take the higher tier. A batch takes the tier of its riskiest change. A change that touches only Markdown files runs no tier.

Batch the work. Start a Standard or Full run only when the batch is final. A request that arrives during the run goes into the next batch, unless it fixes a failure in this run. A stopped and restarted run costs more than the wait.

Design review comes before checks: measure twice, cut once. Michael set this rule on 2026-10-12.

1. While Michael reviews a visual design, do not run tier checks: `scripts/ci-local.sh`, the `/verify-my151` diff, or the whole Playwright suite.
2. Show the built design as pictures from a local build. Then stop and wait for his answer.
3. This applies also when Michael described the change. Show the result before the checks start.
4. Start the tier checks only when Michael says the design is final, for example "ship it" or "ready".
5. During review, fast checks are permitted: `npm run lint`, `npm test`, `npm run build`, and the proof test.

Work-branch tier:

1. Run `npm run lint`, `npm test`, and `npm run build`.
2. Run only the specs that cover the change, in the `desktop` project: `npx playwright test e2e/<name>.spec.ts --project=desktop`.
3. For a layout change, also add `--project=mobile --project=narrow`.
4. When a test fails, fix the cause. Then run `npx playwright test --last-failed`. Do not rerun the whole suite for one failure.

Production tiers:

1. Run the checks of the tier in the table. `bash scripts/ci-local.sh` is lint, unit tests, the repo guards, the whole Playwright suite, `npm run build`, then the bundle budget. On September 30 it took 741 s for 562 browser tests.
2. A failure outside your change does not block the merge. Report it as pre-existing, with evidence: the same failure on production HEAD. In a verify-my151 diff, `(before=fail)` is that evidence.
3. A check that fails once and passes on one rerun of the same build is a timing miss, not a pass. Report it, and fix the check when the same miss repeats.

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
| `npm run test:e2e` | Playwright. Required for UI changes. Auto-starts isolated preview and development servers on ports derived from the worktree path. Use `PLAYWRIGHT_PREVIEW_PORT` and `PLAYWRIGHT_DEV_PORT` to override them. Projects: `mobile`, `desktop`, `narrow` (320px). `desktop` runs every test; `mobile` and `narrow` run only `@viewport` tests. Specs under `e2e/sweeps/` drive their own viewports and run only in `desktop`. |

Against a Vercel preview, skip the local web servers. A preview builds only on request (see "Vercel builds"):

```bash
PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app bash scripts/ci-local.sh
```

That uses `e2e/preview.config.ts` (no vite preview/dev; drops the `dev` project, which needs `PREVIEW_FEATURES`).

Speed changes: prove a change meant to make the app faster with `node scripts/performance/lighthouse.mjs` and `node scripts/performance/lab.mjs`. Both build production and your working tree. `lighthouse.mjs` runs PageSpeed Insights' engine on every page, lists the findings, and fails a change that only games the score (see "Guards" in `docs/performance.md`). `lab.mjs` prints LCP, blocking time, and per-step INP. Paste both tables into the pull request. `node scripts/performance/psi.mjs` reads what Google's PageSpeed Insights shows for the live site, field data included. It needs `PAGESPEED_API_KEY` in the environment settings: the one Google key Michael approved, restricted to PageSpeed Insights. Never print, log, or commit it. Timing is noisy on a shared machine, so the script is evidence, not a ci-local gate. Michael's bar for merging a speed change: it must not hinder the user experience, and it must not overly complicate the code. Prefer the smallest diff that removes the measured cause. A speed change that users can see (content that appears later, a placeholder, a new animation) is a visual choice: show Michael before and after first. The speed targets, and the ideas already tried and left out, are in `docs/performance.md`. Read it before you start speed work.

One browser run at a time on a machine: `lab.mjs` takes the lock itself. Wrap other browser commands in `flock "${TMPDIR:-/tmp}/my151-browser.lock" <command>`, so a Playwright run never overlaps a lab run.

The local `npm run build` is the compile check. Visual review is whole-screen mobile (~390px) and desktop (~1280px) screenshots, with before/after when the view already existed. Use live admin data, not demo fixtures.

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

Before every production push, run the checks of the change's production tier in Build Verification. GitHub Actions is not the deploy signal. Ignore a 2–3s red X. Vercel Ready is the deploy signal. A build that Vercel marks Canceled by the Ignored Build Step is a skip, not a failure.

After every production push, check out the work branch again. A merge leaves you on production, so the next commit would land there. Run `git rev-parse --abbrev-ref HEAD` before any later commit.

### Merge to production without asking

After the checks pass, merge into `claude/pokedex-region-builder-AviYF` and push. Do this as the last step of the work. Do not ask. Do not stop at the work branch. Report the merge in the work report.

Ship without asking when the change is:

- Docs, tests, scripts, `.claude/`, `.github/`, or other files a browser never receives.
- Admin dashboard (`/?admin`) copy, counts, or small layout, when you already have a measured before/after or a test that failed then passed.
- Internal refactors, types, and dead-code removal with no user-noticeable behavior.
- A public-UI bugfix that restores the intended behavior and changes no design, when `/verify-my151` proves it on the surfaces its tier requires. Report it with that evidence.
- A public-UI change whose outcome Michael already decided, under the gate in "Decided by Michael".

### Decided by Michael

Michael set this rule on 2026-10-08. Merge public UI without asking when Michael already decided the outcome: he gave the exact copy, picked an option from pictures, or described the fix. All of these must hold:

1. A proof check fails on the old build and passes on the new build.
2. The `/verify-my151` diff for the tier has 0 regressions.
3. The visual diff shows changes only in the regions the change intends. The `/verify-my151` diff writes it as `visual.json` and `visual.png` in its evidence folder.
4. The tier's checks pass.

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

This repo vendors [open-pstack](https://github.com/ericlitman/open-pstack), a
port of Lauren Tan's pstack to Claude Code. The skills live in
`.claude/skills/`; the subagents live in `.claude/agents/`. Provenance, license,
and resync steps are in `.claude/vendor/open-pstack/README.md`.

Run `/poteto-mode` before a non-trivial code change. It reads the task, picks a
playbook, and routes to the leaf skills. Enter a specific skill directly when
you already know the shape of the work:

| Skill | Use it when |
| --- | --- |
| `/how` | You need to know how a subsystem works before you change it. |
| `/architect` | The change crosses a module boundary and the types come first. |
| `/interrogate` | You want other models to attack a design or a diff. |
| `/tdd` | The bug has a cheap, obvious failing test. |
| `/deslop` | You are about to commit and want the AI tells removed. |

The 21 `principle-*` skills are model-invocable only. They do not appear as
slash commands. `/setup-pstack` configures the multi-model panel, which needs
the Codex and Grok command-line tools plus Bun.

Three notes on how pstack sits next to the rest of this file:

1. This file wins. pstack's own precedence rule says user instructions beat the
   pstack mandate.
2. pstack's `prove it works` principle and the Work reports section agree:
   measure the result, do not infer it from the code.
3. pstack does not change Deployment. Ask-first cases still need approval,
   whatever skill produced them.

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
