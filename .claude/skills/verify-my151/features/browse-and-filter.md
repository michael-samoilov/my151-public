# Browse, filter, pick

The picker that feeds the builder: search and filter the National Dex, then
pick a Pokémon or a whole evolution line.

## Sub-features

- Search by name.
- Filter by type, generation, evolution-line size, category, archetype, shape,
  color, and egg group.
- The type filter is a `[data-testid="type-filter"]` grid of 18 buttons: three
  columns on a phone, six on desktop. The grid exists only while the
  `[data-filter-chip="type"]` sheet is open.
- Results show as evolution-line cards (`EvoLineCard`,
  `[data-testid="verify-evo-card"]`) in a windowed grid.
- On desktop (1024px and wider) the browser is a side pane. On a phone it is a
  bottom sheet (`[data-overlay]` around a `role="dialog"`).

## How to get to it (user POV)

In the builder, tap a section's "+" slot (`[data-add-slot]`). The browser opens
beside the grid on desktop, or over it as a sheet on a phone.

## Driving it with the harness

The harness drives the browser in `placement:real-add-grows-store` and in the
league flows. The placement check opens Meadow's "+" and applies no filters. No
harness check covers filtering. A filter drive uses these handles:

- `[data-result-count]` holds the number of matching results. Read it, not the
  card count, because the grid is windowed.
- `[data-filter-chip]` marks the filter chips: `my-favorites` and one per
  filter sheet. The `my-dex`, `scope`, and `scope-locked` chips show only in
  the league.
- `[data-testid="browser-close"]` closes the desktop pane.

Recipe: open the Other section's add slot and read `[data-result-count]` as N0.
Click `[data-filter-chip="type"]` to open the type grid. Press a type and poll
until the count settles at N1, with 0 < N1 < N0. Search a name: the search
takes over, and the filter chip row dims to 40% opacity. On desktop, click a
card and confirm `state.sections.other` holds the line's ids.

## Gotchas

- The count updates through `useDeferredValue`, so poll `[data-result-count]`
  after each change.
- On desktop a card click adds immediately. On a phone it stages the pick, and
  a floating commit button with no stable handle applies it. A sheet close with
  staged picks asks first (`[data-close-ask]`).
- In the league, a phone tap adds the line and closes the sheet. Staging is
  dex-only.
- A "+" press and a phone sheet close clear the search and every filter
  (`NO_BROWSER_FILTERS` in `usePokedexStore.ts`). That covers type, type mode,
  generation, line size, category, archetype, shape, color, and egg group. A
  tab switch closes the browser and clears them at every width.
- A search ignores every filter except the id restrictions: favorites, the
  league's `my-dex` and `scope`, and a host restriction. Over 150 matching
  lines, the search renders no cards and shows a "too many results" message.
- The phone sheet and the desktop pane are different DOM shapes. Branch on
  viewport, not on one assumed shape. The phone sheet
  (`[data-overlay] [role="dialog"]`) is also in the DOM at desktop width,
  hidden by CSS.
- Select cards by `[data-testid="verify-evo-card"]` and position, never by
  localized name text.
