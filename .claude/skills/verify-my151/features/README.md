# Feature map — my151

One file per user-facing feature, from the user's point of view: what it is, how
to reach it, how to drive it with the harness, and what observable end state
proves it works. The harness's standard suite (`harness/lib/flows.ts`) re-checks
`standard-surfaces` on every run; the other files are the per-feature detail a
change-specific flow builds on.

This map describes **two tools**: the pokedex builder with its view and
analytics tabs, and the Pokémon League Builder. The favourite picker, when it
lands, adds one file of its own. Do not treat this list as final; grow it with
the app and keep it honest with `/maintain-verification-skill`.

| Feature | File | Owner (source) |
| --- | --- | --- |
| Standard surfaces (the invariant suite) | `standard-surfaces.md` | `src/App.tsx`, `src/components/layout/Header.tsx` |
| Build the dex (place Pokémon) | `build-and-place.md` | `src/components/pokedex/PokedexGrid.tsx` |
| Browse, filter, pick | `browse-and-filter.md` | `src/components/browser/PokemonBrowser.tsx` |
| View and export the finished dex | `view-and-export.md` | `src/components/view/ViewPage.tsx` |
| Analytics dashboard | `analytics.md` | `src/components/analytics/AnalyticsDashboard.tsx` |
| Pokémon League Builder | `league-builder.md` | `src/league/LeagueApp.tsx`, `src/league/components/CardGrid.tsx` |

## Stable handles (the whole app has few)

- Nav tabs: `[data-nav="builder"]`, `[data-nav="analytics"]`, `[data-nav="view"]`.
  Active tab = `aria-selected="true"` on the tab inside `[role="tablist"]`.
  Fallback: the one whose computed `background-color` is non-transparent.
- Builder scroll container: `[data-build-scroll]`.
- Type filter: `[data-testid="type-filter"]`.
- Bottom-sheet overlay: `[data-overlay]`; sheets are `role="dialog"`.
- State oracle: localStorage `personal-151-pokedex-v3`, a zustand-persist blob
  `{state:{sections:{groupId:number[]},…},version:10}`. `sections` is the source
  of truth for a build.
- League builder: slots `[data-testid="league-slot-N"]`, cells
  `[data-testid="card-cell-<row>-<seat>"]`, the ace and partner slots
  `[data-testid="slot-ace"]` and `[data-testid="slot-partner"]`, Story /
  Rematch tabs `[data-testid="league-nav"]` / `[data-league-view]`, and the
  `league-builder` localStorage key as its oracle. See `league-builder.md`.

The three tabs are React state, not URL-addressable, so navigate by clicking
`[data-nav]`, never by deep link. Most `aria-label`s are i18n-templated; do not
select on their text.
