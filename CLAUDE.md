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

Never drop these as tangents or preamble:

- A request for approval before a production merge.
- A correction to an earlier statement that was wrong.
- A defect or risk found in the work, including my own.

Both source documents list the same exception: confirmation of a risky action, and real ambiguity, outrank brevity.

## Build Verification

Always run `npm run build` to verify the build compiles before committing and pushing. Never push code that has not been build-verified. The build includes sprite caching and stricter type checking than `tsc --noEmit` alone.

## Deployment

**The app has real users. `claude/pokedex-region-builder-AviYF` is production — never push to it without explicit approval in the current conversation.**

Work on a preview branch by default:

1. Commit to the work branch and push it (`git push -u origin <work-branch>`). Vercel builds a **preview deployment** for any pushed branch — that is where changes get verified.
2. Report the preview to the user and let them look. Nothing reaches production on your own initiative.
3. Merge into and push `claude/pokedex-region-builder-AviYF` **only after the user says to ship it.** Approval is per-change: shipping one change is not standing permission for the next.

When in doubt, push the preview branch and ask. A change sitting on a preview branch costs nothing; an unapproved production deploy is seen by users.

Two notes on scope, since "it's only SEO/config" is exactly how unapproved changes reach users:

- **Meta tags, `robots.txt`, `sitemap.xml` and other crawler-only files are still production changes.** They are lower-risk, not zero-risk, and still need approval before merging.
- **Check whether a change is user-visible before calling it invisible.** `theme-color` tints mobile browser chrome; markup inside `#root` renders until React mounts. The app currently runs in **light** mode — the `.dark` block in `index.css` exists but nothing ever applies the class — so dark-themed additions will mismatch the live UI.

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
