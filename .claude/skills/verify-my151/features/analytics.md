# Analytics dashboard

Compares the user's dex against national baselines with several charts and a
drill-down.

## Sub-features

- Unlocks at 25 placed Pokémon (sticky once unlocked).
- Charts: WhatsAdvisor, ButterflyChart (type / generation / shape),
  SuperimposedHistogram (evo level, BST), StageDistributionChart.
- Drill-down: a bottom sheet on mobile (`DrillDownSheet`), a side pane on desktop
  (`DrillDownPanel`).

## How to get to it (user POV)

Once 25 are placed, the analytics tab (`[data-nav="analytics"]`) becomes a real
nav button (before that it is a locked button that only shows a tooltip). Tapping
it opens the dashboard. Tapping a chart segment opens the drill-down.

## Driving it with the harness

Seed 25+ Pokémon so the tab unlocks, click `[data-nav="analytics"]`, and assert it
activates (computed background non-transparent) and charts render (SVG present).
For drill-down, click a chart segment and assert the sheet (`role="dialog"`,
`[data-overlay]`) or the desktop pane appears.

## Gotchas

- Below 25 placed, `[data-nav="analytics"]` is the locked variant; clicking it
  does not navigate, so an unseeded run cannot reach the dashboard. The standard
  suite's 37-Pokémon seed clears this.
- Charts scale with a container `ResizeObserver` (`chartScale`), so geometry
  differs across viewports; assert presence and structure, not fixed pixel sizes.
- The dashboard is a lazy chunk; allow it to mount after the nav click before
  asserting.
