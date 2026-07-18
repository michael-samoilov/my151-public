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
<div class="flex items-center …">
  <div class="shrink-0" style="width: var(--ms-side)">  ← left slot, fixed width
    <h2 class="… tabular-nums">100/151</h2>              ← counter, left-aligned
  </div>
  <div class="flex-1 min-w-0"><MilestoneBar/></div>      ← bar cell grows to fill
  <div class="shrink-0 flex justify-end" style="width: var(--ms-side)">
    …controls…                                           ← gear / export
  </div>                                                 ← empty slot on Analytics
</div>
```
`.milestone-bar { width: 100%; }` — the bar takes its whole flex cell. Because
the cell is `flex-1`, the bar spans whatever horizontal space is left between the
two fixed side slots.

### Side slots + dividers (`--ms-side`)
Both side slots have the SAME fixed width, `--ms-side` (6.75rem, in `src/index.css`).
It's sized to the widest side element in the worst case — the `tabular-nums`
counter at a triple-digit count (`151/151`, ~6.15rem of glyph ink) — plus a bit
of padding. Because it's a fixed rem, and both slots use it:

- The two hairline **dividers** sit at the inner edge of each slot (rendered at
  the bar cell's `left:0` / `right:0`), so they're at the **same inset from both
  edges** and never move as the count grows 1→2→3 digits.
- The counter (`tabular-nums`, left-aligned) always fits its slot with a clear
  gap to the left divider; the controls (right-aligned) fit the right slot.
- Analytics has no controls, but still reserves an empty right slot so its right
  divider matches the left — bar width is identical to View at each viewport.

The bar's **track is inset** from the dividers by `barInsetRem` (0.95rem) so the
end beads (centered at 0% / 151%, radius ≈0.71rem) stay INSIDE the dividers with
a small visible gap instead of spilling across them.

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
4. the two dividers are symmetric (equal inset from both cell edges),
5. the bar's visible extent (end beads) sits INSIDE both dividers,
6. the bar width does not change when you leave and return to a page.

```bash
npm run dev          # serves on http://localhost:5173
node test-header-spacing.mjs
```

> Note: an earlier harness measured the app's top `<header>` (the logo + nav row)
> instead of the page header row where the bar actually is, and navigated via a
> `?view=` param the app ignores — so it validated the Builder page three times
> and reported a phantom overlap between two different rows. This harness locates
> the bar's own row and drives real navigation to avoid both mistakes.
