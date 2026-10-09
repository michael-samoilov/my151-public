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

The standard suite clicks `[data-nav="analytics"]` and asserts that the tab
activates. It reads `aria-selected` first, with the computed background as a
fallback, and runs a tabset check. It also checks the header lanes and runs the
render audit. It does not check for SVG or open a drill-down.

A drill-down drive uses these handles:

- Chart rows: `g[data-row-key][role="button"]`, with `aria-label` and
  `aria-pressed`. The chart's `svg` carries `data-index-domain` and
  `data-count-baseline`.
- Histogram bins: `rect[role="button"]` with `aria-label="lo–hi"`. The mean
  marks carry `data-mean-*` attributes.
- Phone sheet: `div.inset-x-0.bottom-0.z-50`. It is `fixed` only in its peek
  state and `absolute` once expanded. Desktop pane:
  `.w-1/2.flex-shrink-0.border-l`.

Manual drive (a Playwright script): seed 37, click the analytics tab, and click
the first `g[data-row-key][role="button"]`. Expect the pane with sprite images
and a `rect` whose fill is not transparent. Click the row again and expect the
pane to close.

## Gotchas

- The drill-down sheet has no `role="dialog"` and no `[data-overlay]`. Do not
  wait on them.
- The pane's close button has no `aria-label`.
- After unlock, the dashboard pre-mounts in a hidden container on idle. It is
  the one instance, so its elements exist before the tab shows. Check
  visibility, not only presence.
- Charts scale with a container `ResizeObserver` (`chartScale`), so geometry
  differs by viewport. Assert presence and structure, not pixel sizes.
- The dashboard is a lazy chunk. Allow it to mount after the nav click.
