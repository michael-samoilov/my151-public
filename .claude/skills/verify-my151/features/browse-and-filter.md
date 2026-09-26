# Browse, filter, pick

The picker that feeds the builder: search and filter the National Dex, then
pick a Pokémon or a whole evolution line.

## Sub-features

- Search by name.
- Filter by type, generation, evolution-line size, category, archetype, shape,
  color, and egg group.
- The type filter is a `[data-testid="type-filter"]` grid of 18 buttons: three
  columns on a phone, six on desktop.
- Results show as evolution-line cards (`EvoLineCard`,
  `[data-testid="verify-evo-card"]`) in a windowed grid.
- On desktop (1024px and wider) the browser is a side pane. On a phone it is a
  bottom sheet (`[data-overlay]` around a `role="dialog"`).

## How to get to it (user POV)

In the builder, tap a section's "+" slot (`[data-add-slot]`). The browser opens
beside the grid on desktop, or over it as a sheet on a phone.

## Driving it with the harness

The harness drives the browser only inside `placement:real-add-grows-store`.
A filter drive uses these handles:

- `[data-result-count]` holds the number of matching results. Read it, not the
  card count, because the grid is windowed.
- `[data-filter-chip]` marks the filter chips (`my-dex`, `scope`, and one per
  filter sheet).
- `[data-testid="browser-close"]` closes the desktop pane.

Recipe: open the Other section's add slot and read `[data-result-count]` as N0.
Press a type in the type filter and poll until the count settles at N1, with
0 < N1 < N0. Search a name: the search takes over, and the filter chip row
dims to 40% opacity. On desktop, click a card and confirm
`state.sections.other` holds the line's ids.

## Gotchas

- The count updates through `useDeferredValue`, so poll `[data-result-count]`
  after each change.
- On desktop a card click adds immediately. On a phone it stages the pick, and
  a floating commit button with no stable handle applies it.
- A "+" press and a phone sheet close clear the search and the type,
  generation, line-size, category, and archetype filters (`PokedexGrid.tsx`,
  `App.tsx`). A desktop tab switch clears nothing.
- The phone sheet and the desktop pane are different DOM shapes. Branch on
  viewport, not on one assumed shape.
- Select cards by `[data-testid="verify-evo-card"]` and position, never by
  localized name text.
