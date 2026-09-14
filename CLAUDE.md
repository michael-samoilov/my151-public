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

- A request for approval before a tier 2 production merge (see Deployment).
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

Before every commit and push, run `bash scripts/ci-local.sh`. That is lint, unit tests, Playwright, then `npm run build`. Never push code that has not passed this script. `npm run build` alone is not enough.

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

**The app has real users. `claude/pokedex-region-builder-AviYF` is production.** The approval rule has one purpose: keep an untested, user-visible change out of the live app before it is ready to show users. It guards the browser, not the repo. A change a browser never receives carries no such risk, so it ships automatically. Two tiers decide whether a merge needs approval.

### Tier 1: merge to production automatically

A change is tier 1 when **every file in the diff** sits outside what a browser receives. Those paths are:

- `.claude/` and `.github/`
- `docs/`, `e2e/`, `scripts/`, and `*.test.ts` files
- `CLAUDE.md`, `README.md`, and other root Markdown

A tier 1 change is not finished on the work branch. Finishing it means it reaches production. Run `npm run build`, then merge into `claude/pokedex-region-builder-AviYF`, push it, and check out the work branch again. Do this as the normal last step of the work. Do not ask, do not stop at the work branch, and do not call the production merge optional. Report the merge in the work report.

### Tier 2: ask first

Everything else needs the user's explicit approval in the current conversation. One file outside the tier 1 list puts the whole change in tier 2. Tier 2 covers:

- `src/`, `api/`, `public/`, and `index.html`
- `vite.config.ts`, `vercel.json`, `package.json`, and the other build config
- **Meta tags, `robots.txt`, `sitemap.xml` and other crawler-only files.** They are lower-risk, not zero-risk, since "it's only SEO/config" is exactly how unapproved changes reach users.

Approval is per-change: shipping one change is not standing permission for the next.

Work a tier 2 change like this:

1. Commit to the work branch and push it (`git push -u origin <work-branch>`). Vercel builds a **preview deployment** for any pushed branch — that is where changes get verified.
2. Report the preview to the user and let them look. Nothing reaches production on your own initiative.
3. Merge into and push `claude/pokedex-region-builder-AviYF` **only after the user says to ship it.**
4. **Check out the work branch again immediately after that push.** A merge leaves you on the production branch, so the next commit lands there silently — one `git push` away from an unapproved deploy. Run `git rev-parse --abbrev-ref HEAD` before any commit that follows a merge.

Step 4 applies to a tier 1 merge too. The branch you end on does not depend on the tier.

When the tier is unclear, treat the change as tier 2 and ask. A change sitting on a preview branch costs nothing; an unapproved production deploy is seen by users.

**Check whether a change is user-visible before calling it invisible.** `theme-color` tints mobile browser chrome; markup inside `#root` renders until React mounts. The app currently runs in **light** mode — the `.dark` block in `index.css` exists but nothing ever applies the class — so dark-themed additions will mismatch the live UI.

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
3. pstack does not change the Deployment tiers. A tier 2 change still needs
   your approval, whatever skill produced it.

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
