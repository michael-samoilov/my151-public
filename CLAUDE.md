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

## Style guide

Write all prose in [Google developer documentation style](https://developers.google.com/style). This covers responses, visible thinking, commit messages, PR text, code comments, and docs. The distilled rules are in `.claude/skills/google-style/SKILL.md`. A SessionStart hook in `.claude/settings.json` injects them into context each session. If the hook output is absent, read that file before your first response. For word-level questions, read `word-list.md` in the same directory.

Two boundaries:

- The Response style section wins when the two guides conflict.
- App UI strings and i18n content are out of scope. Game terminology and the `docs/i18n` fixtures stay authoritative there.

## Work reports

End every turn that changes anything with the five-part report in `.claude/skills/work-report/SKILL.md`: Changed, Merge, Verified, Tradeoffs, You test. The SessionStart hook injects the template each session. "Verified" means measured — root-cause tests, or screenshots from the running app — never inferred from code alone. For UI changes, send a before-and-after side by side so review needs no preview deploy. Show the whole screen with the place to look marked on it, never only a crop — see "Showing a defect" in the same file. Any visual change (bugfix, feature, polish) must run `/verify-my151` and show the same input on the old build, then the new build. Paint those shots in the chat. Do not only link PNG paths. Do not ask Michael to retest a change you can drive here. **You test** is `Nothing` unless the hand-off test names a device-only gap.

Before you share a rendered mockup, an image export, or a static page, run the fix loop in `.claude/skills/render-audit/SKILL.md` until a round is clean: render, audit, fix at the source, repeat. A clipped icon, a truncated name, or a label wrapped onto three lines is a defect you find, not one the reviewer points out. When the real app changed, the loop ends with the verify-my151 diff, which runs the same audit on every engine. The clean round belongs under "Verified".

## Build Verification

GitHub Actions is not used. Do not retry Actions. Do not wait for PR checks. The workflow file is `workflow_dispatch` only. Restore `push` / `pull_request` only if billing allows jobs to start.

Verification has two tiers. Run the tier that matches the push.

| Push | Run |
|---|---|
| Work branch | `npm run lint`, `npm test`, `npm run build`, and the Playwright specs that cover the change. |
| Production merge | `bash scripts/ci-local.sh` once, on the merged result. |

A change that touches only Markdown files runs neither tier.

Work-branch tier:

1. Run `npm run lint`, `npm test`, and `npm run build`.
2. Run only the specs that cover the change, in the `desktop` project: `npx playwright test e2e/<name>.spec.ts --project=desktop`.
3. For a layout change, also add `--project=mobile --project=narrow`.
4. When a test fails, fix the cause. Then run `npx playwright test --last-failed`. Do not rerun the whole suite for one failure.

Production tier:

1. Run `bash scripts/ci-local.sh` once, before the merge. That is lint, unit tests, Playwright, then `npm run build`.
2. A failure outside your change does not block the merge. Report it as pre-existing, with evidence: the same failure on production HEAD.

Test rules: read `AGENTS.md` section 4, "Testing", before you write, change, or delete a test. Those rules apply to every agent in this repository. In short: prove a change with a proof test that fails on the old code and passes on the new code, report both results, and do not commit that test. Prefer E2E tests that end with a repeatable artifact. Keep a unit test only when it catches a bug that E2E misses.

`npm run build` is exactly `npm run i18n:verify && tsc -b && vite build`. The `tsc -b` step covers `src`, `api`, `scripts` and `e2e` via the project references in `tsconfig.json` — note that `api/` is Vercel serverless code that Vite never touches, so this typecheck is its only local gate. **Sprite caching is not part of the build**; it is a separate, manual `npm run cache-sprites`.

`npm run i18n:verify` (`scripts/i18n/verify.ts`) is the deterministic i18n gate. It holds every type name to the string dumped from Scarlet/Violet's own `typename` table, and checks placeholder integrity, untranslated-copy detection, Unicode hygiene, CJK case safety and length budgets. It reads only checked-in files, so it needs no network. Its type-name fixture is `docs/i18n/sources/scarlet-violet-typenames.json`, regenerated by the separate, manual `npm run i18n:game-text` — the *only* step that touches the network, and it is not part of the build.

The other checks, which `scripts/ci-local.sh` also runs:

| Command | Covers |
|---|---|
| `npm run lint` | ESLint. Pre-existing violations are recorded in `eslint-suppressions.json`, so this passes today and any *new* violation fails. Regenerate with `npx eslint . --suppress-all` only when deliberately accepting a new one. **If you *fix* a suppressed violation, run `npx eslint . --prune-suppressions`** — a stale entry exits 2 and fails CI just as loudly as a new violation. |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`, `scripts/**/*.test.ts`). |
| `npm run test:e2e` | Playwright. Required for UI changes. Auto-starts `vite preview` on port 4173, so no server needs to be running. Projects: `mobile`, `desktop`, `narrow` (320px). Specs under `e2e/sweeps/` drive their own viewports and run only in `desktop`. |

Against a Vercel preview, skip the local web servers:

```bash
PLAYWRIGHT_BASE_URL=https://<preview>.vercel.app bash scripts/ci-local.sh
```

That uses `e2e/preview.config.ts` (no vite preview/dev; drops the `dev` project, which needs `PREVIEW_FEATURES`).

Vercel preview Ready/Error is the independent compile check. Visual review is whole-screen mobile (~390px) and desktop (~1280px) screenshots, with before/after when the view already existed. Use live admin data, not demo fixtures.

## Deployment

**The app has real users. `claude/pokedex-region-builder-AviYF` is production.**

Do not wait for Michael to ship low-risk, already-verified work. Merge it to `claude/pokedex-region-builder-AviYF`.
The approval rule keeps an untested change that **end users** see out of the live app.
Judge the change by what it does, not only by which folder the files sit in.

Before every production push, run the production tier of Build Verification (`bash scripts/ci-local.sh`). GitHub Actions is not the deploy signal. Ignore a 2–3s red X. Vercel Ready is the compile and deploy signal.

After every production push, check out the work branch again. A merge leaves you on production, so the next commit would land there. Run `git rev-parse --abbrev-ref HEAD` before any later commit.

### Merge to production without asking

After the checks pass, merge into `claude/pokedex-region-builder-AviYF` and push. Do this as the last step of the work. Do not ask. Do not stop at the work branch. Report the merge in the work report.

Ship without asking when the change is:

- Docs, tests, scripts, `.claude/`, `.github/`, or other files a browser never receives.
- Admin dashboard (`/?admin`) copy, counts, or small layout, when you already have a measured before/after or a test that failed then passed.
- Internal refactors, types, and dead-code removal with no user-noticeable behavior.

Admin is not public product UI. A verified admin Dex-chip count ships. A verified admin layout tweak ships.

### Ask first

Ask in the current conversation before you merge when any of these apply:

1. **Public product UI.** The pokedex builder, league builder, or export that end users see. Admin `/?admin` copy, counts, or small verified layout is not this.
2. **Data destruction or irreversible writes.** Deletes, schema drops, token or credential changes, anything a revert does not undo.
3. **Large or ambiguous product changes.** Unclear scope, or a change big enough that Michael should see it first.

When you are unsure, ask. A preview branch costs nothing.

Work an ask-first change like this:

1. Commit to the work branch and push it (`git push -u origin <work-branch>`). Vercel builds a preview deployment. Verify there.
2. Report the preview. Do not merge to production until Michael says to ship it.
3. After he says to ship it, merge into and push `claude/pokedex-region-builder-AviYF`.
4. Check out the work branch again immediately after that push.

**Check whether a change is user-visible before calling it invisible.** `theme-color` tints mobile browser chrome. Markup inside `#root` renders until React mounts. The app runs in **light** mode. The `.dark` block in `index.css` exists, but nothing applies the class, so dark-themed additions mismatch the live UI.

## Cursor Cloud specific instructions

Development happens through Cloud Agents, often from the mobile Cursor app. Two consequences follow.

- **Do not verify on localhost.** The mobile client cannot reach the agent's `localhost`, so a running dev server is not evidence a reviewer can see. Verify with the `verify-my151` harness (`.claude/skills/verify-my151`, three engines) and the branch's Vercel preview deployment. Capture screenshots or recordings as walkthrough artifacts.
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
