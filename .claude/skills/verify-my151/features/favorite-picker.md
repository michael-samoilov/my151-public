# Favorite Pokémon picker

Pick one Pokémon per type-by-generation cell, plus starter, gimmick, legendary, and favorite pointers. Packing keeps form IDs unique among the 18 type cells of one generation.

## Reach

- Hub card **Favorite Pokémon Picker** to `/favorite-pokemon-by-type`.
- Tools menu to Favorite Pokémon Picker.

## Drive

1. Open `/favorite-pokemon-by-type`.
2. Tap `[data-testid="favorites-cell-<type>-<gen>"]`.
3. Tap `[data-testid="favorites-pick-<id>"]` in `[data-testid="favorites-picker"]`.
4. Relocate a dual-type onto an occupied cell with a keep-everyone route to open `[data-testid="favorites-packing"]`. Each Pokémon appears once with its old type at top-left and its destination at top-right. A replacement with only a direct trash route applies without opening packing.

## Oracle

- localStorage `favorite-picker`: `{state:{fills:{"fire|1":4}},version:1}`.
- Grid: `[data-testid="favorites-grid"]`. Filled sprites may extend beyond their cell borders.
- The last `[data-pretty-row]` is centered when shorter than the row above. A tall selector shrinks sprite cells to fit the mobile pane without scrolling.
- An empty destination does not open packing. The Pokémon moves, and its old cell clears.
- Packing options show unoutlined sprites with old type, arrow, and new type or trash marks above them. Only trashed Pokémon are faded.
- `[data-testid="favorites-clear"]` is a red x, at least half the tile wide, centered over the selected Pokémon. The selected sprite is translucent. There is no text label. Tapping the selected Pokémon clears the cell.
- Species type badges appear only in type-column selectors. Already-used type badges may also appear in pointer selectors, without fading those Pokémon.
- Pointer source badges identify starter, gimmick, legendary, generation, and type sources. The overall favorite pool includes the legendary favorite.
- `[data-testid="favorites-minimap"]` represents only the interactive body grid. It distinguishes filled and empty cells, shows during scroll, and fades after idle. Its viewport border uses the site theme red.

## Harness

`runFavoritesSuite` in `harness/lib/flows.ts` skips when `/favorite-pokemon-by-type` is the SPA fallback. It checks the hub card, grid boot, empty-ball fit, picker row centering, six-column sprite sizing when space allows, a compact short sheet, tall-selector fit, packing marks and opacity, direct trash swap, state writes, sprite overflow, selection rings, clear control, type and pointer badges, and minimap structure and fade. A chain longer than four links uses stepped mode. The longest real keep-everyone chain is 17 links (Gen 3, Normal, incoming 263).
