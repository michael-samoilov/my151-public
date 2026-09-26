# Favorite Pokémon picker

A grid of type columns by generation rows at `/favorite-pokemon-by-type`. The
user picks one favorite Pokémon per cell. Extra columns and rows hold starter,
gimmick, legendary, and favorite picks.

## Sub-features

- Grid: 18 type columns plus starter, legendary, gimmick, and favorite; 9
  generation rows plus legendary, gimmick, and favorite. Each body cell is a
  `[data-testid="favorites-cell-<type>-<gen>"]` button whose `data-kind` is
  `pick`, `pointer`, `disabled`, or `null`. Empty cells show a faint Poké Ball.
  Filled sprites may extend past their cell borders.
- Grid frame `[data-testid="favorites-grid-scroll"]`: fills the screen below the
  two page headers and scrolls on both axes. The header row and generation
  column are sticky inside it.
- Zoom: a two-finger pinch, a Safari gesture, or ctrl+wheel over the frame zooms
  the grid, not the page. `data-zoom` on the frame holds the factor, 1 to 4 on
  mobile and 1 to 2.5 on desktop. Body cells scale fully. The sticky headers
  grow to at most 1.25 times their zoom-1 size.
- Minimap `[data-testid="favorites-minimap"]`: sits in the frame's bottom-right
  corner with no transform. It draws body cells only, shows filled and empty
  cells differently, shows while the grid scrolls or zooms, and fades after
  idle. Its window `[data-testid="favorites-minimap-viewport"]` uses the site
  red. It is hidden when the whole grid fits.
- Selector `[data-testid="favorites-picker"]`: a bottom sheet below 1024px, a
  popover next to the tapped cell on desktop. Sprites
  `[data-testid="favorites-pick-<id>"]` sit in rows of up to six; a short last
  row is centered. A tall selector shrinks its sprites to fit the phone pane.
- Clear: the current pick is translucent, with a red x
  `[data-testid="favorites-clear"]` centered over it. Tapping it clears the
  cell.
- Pointer cells (favorite row and column, legendary × legendary, gimmick ×
  gimmick): list picks
  from other cells, with source badges `[data-testid="favorites-pointer-mark"]`.
  With nothing to point at, the selector shows a "?" Unown empty state
  `[data-testid="favorites-empty-unown"]`.
- A form holds at most one of the 18 type cells in a generation. Picking it
  elsewhere moves it and clears the old cell. The packing sheet
  `[data-testid="favorites-packing"]` is off for users.

## How to get to it (user POV)

Tap the **Favorite Pokémon Picker** card on the hub at `/`, or pick it from the
Tools menu. Tap a cell to open its selector, then tap a Pokémon.

## Driving it with the harness

`runFavoritesSuite` in `harness/lib/flows.ts` runs on every surface. It skips
when `/favorite-pokemon-by-type` serves the SPA fallback. It checks the hub
card, grid boot, empty-ball fit, selector row centering and sprite size, the
short sheet, tall-selector fit, packing staying off, direct replacement and
trash swap, store writes, sprite overflow, selection rings, the clear x, type
and pointer badges, minimap structure and fade, and app zoom (cell growth, far
corner inside the frame, sticky headers on the frame edges, untransformed
minimap in the frame).

Manual drive (a Playwright script, local build):

1. Seed localStorage `favorite-picker` with
   `{"state":{"fills":{"fire|1":6}},"version":1}` and open
   `/favorite-pokemon-by-type`.
2. Click `[data-testid="favorites-cell-water-1"]`, then
   `[data-testid="favorites-pick-9"]`. Expect `fills["water|1"]` to be `9`.
3. Reopen `water-1`. Expect `[data-testid="favorites-clear"]` inside
   `favorites-pick-9`, and the sprite's opacity below 0.5.
4. Zoom with ctrl+wheel over the frame, or with CDP two-finger touch events on
   a touch context. Expect `data-zoom` above 1.
5. Scroll the frame to its far corner. Expect the last cell inside the frame
   and the header row's top equal to the frame's top.

## Gotchas

- Saved picks live under `favorite-picker` as
  `{state:{fills:{"<type>|<gen>":id}},version:1}`. Never clear it on a real
  user's browser. A grid-shape change must migrate it.
- `?packing=1` turns the packing sheet on outside production, for specs only.
  It is off on the live site.
- Only Gen 5-style pixel sprites appear. Forms without one are logged in
  `docs/favorite-picker-sprite-wishlist.md` and stay out of the selector.
- WebKitGTK's WebDriver scrolls only the page before a click. Scroll a cell into
  the grid frame first, or the click reports "element not interactable".
- A pinch on the page header or footer still zooms the whole page natively.
- Zoom resets on reload.
- Opening the page sends a `favorites-open` event. A browser that visited any
  page once with `?notme` flags it as the owner's.
