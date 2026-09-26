# Analytics dashboard

Compares the user's dex against national baselines with several charts and a
drill-down.

## Sub-features

- Unlocks at 25 placed Pokémon and stays unlocked after that.
- Charts: WhatsAdvisor, ButterflyChart (type, generation, shape),
  SuperimposedHistogram (evolution level, BST), and StageDistributionChart.
- Drill-down: a bottom sheet on a phone (`DrillDownSheet`), a side pane on
  desktop (`DrillDownPanel`).

## How to get to it (user POV)

After 25 are placed, the analytics tab (`[data-nav="analytics"]`) is a real nav
button. Before that, a locked button with the same `data-nav` shows a tooltip
and does not navigate. Tapping a chart row or bar opens the drill-down.

## Driving it with the harness

The standard suite clicks `[data-nav="analytics"]`, asserts that the tab
activates (computed background), checks the header lanes, and runs the render
audit. It does not check for SVG or open a drill-down.

`src/components/analytics` has no `data-testid`, `data-*`, or ARIA role
handles, so a drill-down drive selects by structure:

- Chart rows: `svg g.cursor-pointer`. Histogram bins: `svg rect.cursor-pointer`.
- Phone sheet: `div.fixed.inset-x-0.bottom-0.z-50`. Desktop pane:
  `.w-1/2.flex-shrink-0.border-l`.

Manual drive (a Playwright script): seed 37, click the analytics tab, and click
the first `svg g.cursor-pointer`. Expect the pane with sprite images and a
`rect` whose fill is not transparent. Click the row again and expect the pane
to close.

## Gotchas

- The drill-down sheet has no `role="dialog"` and no `[data-overlay]`. Do not
  wait on them.
- The pane's close button has no `aria-label`.
- After unlock, the dashboard pre-mounts in a hidden container on idle. Count
  only visible elements, or you count the hidden copy too.
- Charts scale with a container `ResizeObserver` (`chartScale`), so geometry
  differs by viewport. Assert presence and structure, not pixel sizes.
- The dashboard is a lazy chunk. Allow it to mount after the nav click.
