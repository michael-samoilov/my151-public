# CLAUDE.md

## Context Resumption

When resuming from a context summary (e.g. after running out of context), only act on items explicitly listed under "Pending Tasks." Do not revisit, verify, or re-investigate completed work. Treat the summary's completed items as done — pick up exactly where things left off.

## Verification

Always run `npm run build` before committing and pushing. Never push code that has not been build-verified.

`npm run build` is exactly `tsc -b && vite build`. The `tsc -b` step covers `src`, `api`, `scripts` and `e2e` via the project references in `tsconfig.json` — note that `api/` is Vercel serverless code that Vite never touches, so this typecheck is its only local gate. **Sprite caching is not part of the build**; it is a separate, manual `npm run cache-sprites`.

Other checks, all of which also run in CI (`.github/workflows/ci.yml`):

| Command | Covers |
|---|---|
| `npm run lint` | ESLint. Pre-existing violations are recorded in `eslint-suppressions.json`, so this passes today and any *new* violation fails. Regenerate with `npx eslint . --suppress-all` only when deliberately accepting a new one. |
| `npm test` | Vitest unit tests (`src/**/*.test.ts`, `scripts/**/*.test.ts`). |
| `npm run test:e2e` | Playwright. Auto-starts `vite preview` on port 4173, so no server needs to be running. Projects: `mobile`, `desktop`, `narrow` (320px). Specs under `e2e/sweeps/` drive their own viewports and run only in `desktop`. |

CI runs on every branch push and PR, but it can only *block* a merge if branch protection is enabled on the deploy branch — that is a repo setting, not something in the tree.

## Deployment

Vercel auto-deploys from the `claude/pokedex-region-builder-AviYF` branch. After committing to any work branch, always merge into and push `claude/pokedex-region-builder-AviYF` so changes go live. Do not push only to the work branch — the deploy branch must be updated every time.

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
