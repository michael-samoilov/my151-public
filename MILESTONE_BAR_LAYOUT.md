# Milestone Bar — Layout & Sizing

## What the bar does
The milestone progress bar lives in every page's own header row — the `n/151`
row on Builder, View, and Analytics — so it (and the counter) are visible at all
times, on every page.

## Sizing: it FILLS the available space
The bar is a **flex child that grows to fill** the gap between the counter (left)
and the page controls (right). It is **not** a fixed/clamped width and is **not**
absolutely centered.

Header row structure (all three pages):
```
<div class="flex items-center gap-4 …">
  <h2 class="… shrink-0">100/151</h2>     ← counter, fixed size
  <div class="flex-1 min-w-0"><MilestoneBar/></div>  ← bar cell grows to fill
  <div class="shrink-0">…controls…</div>  ← gear / export (absent on Analytics)
</div>
```
`.milestone-bar { width: 100%; }` — the bar takes its whole flex cell. Because
the cell is `flex-1`, the bar spans whatever horizontal space the page's header
has left after the counter and controls. The `gap-4` on the row provides the
gutter on each side, so the bar never touches the counter or the controls.

Consequences (all intended):
- The bar is **wider on wider viewports** — it tracks the real available width.
- The bar width **differs per page** because the available space differs: on
  desktop the Builder page is a centered half-width column, while View/Analytics
  are full width, so the bar is naturally longer on View/Analytics. Each page
  fills its own context.

The **measured pixel width** (via `ResizeObserver`, not a CSS rem) drives the
bead-footprint fill-skip math, so the fill stays correct at any resolved width.

## No overlap — structurally guaranteed
Because the counter, bar cell, and controls are flex siblings in order, the bar
cell always begins after the counter and ends before the controls. Overlap is
not possible by construction (the old absolute-centered bar could, and did, slide
under the counter at 3-digit counts — that's fixed).

## No re-animation on page switch
When a page is hidden (`display:none`) its bar measures width 0. The
`ResizeObserver` **ignores zero-width reads** and keeps the last real width, so
switching pages produces no width change and therefore no fill-transition
re-animation. The bar is also wrapped in `React.memo`.

## Verifying
`test-header-spacing.mjs` seeds the store to 100 Pokémon, drives the real nav
buttons to each page, and — for every viewport — asserts:
1. counter / bar / controls share a row (no cross-row false positives),
2. counter → bar → controls are ordered with a positive gap (no overlap),
3. the bar fills ≥ 80% of the counter→controls space,
4. the bar width does not change when you leave and return to a page.

```bash
npm run dev          # serves on http://localhost:5173
node test-header-spacing.mjs
```

> Note: an earlier harness measured the app's top `<header>` (the logo + nav row)
> instead of the page header row where the bar actually is, and navigated via a
> `?view=` param the app ignores — so it validated the Builder page three times
> and reported a phantom overlap between two different rows. This harness locates
> the bar's own row and drives real navigation to avoid both mistakes.
