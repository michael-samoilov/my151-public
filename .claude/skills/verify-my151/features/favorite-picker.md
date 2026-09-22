# Favorite Pokémon picker

Pick one Pokémon per type×generation cell (plus starter, gimmick, legendary, and favorite pointers). Packing keeps form ids unique among the 18 type cells of one generation.

## Reach

- Hub card **Favorite Pokémon Picker** → `/favorite-pokemon-by-type`
- Tools menu → Favorite Pokémon Picker

## Drive

1. Open `/favorite-pokemon-by-type`.
2. Tap `[data-testid="favorites-cell-<type>-<gen>"]`.
3. Tap `[data-testid="favorites-pick-<id>"]` in `[data-testid="favorites-picker"]`.
4. Relocate a dual-type onto an occupied cell to open `[data-testid="favorites-packing"]`. The origin slot is `[data-role="vacate"]` and shows that Pokémon faded.

## Oracle

- localStorage `favorite-picker`: `{state:{fills:{"fire|1":4,…}},version:1}`
- Grid: `[data-testid="favorites-grid"]`
- Last picker row: `[data-pretty-row]` with `justify-content: center` when shorter than the row above.
- An empty destination does not open `[data-testid="favorites-packing"]`. The Pokémon moves, and its old cell clears.
- A chain is listed only when the destination is already filled. Choosing the trash chain writes the incoming id into the opened cell.
- `[data-testid="favorites-clear"]` is a cell at the end of `[data-testid="favorites-pretty-grid"]`, the same size as a Pokémon cell.
- A Pokémon already in another type cell is faded and carries `[data-testid="favorites-used-mark"]` for that type.
- `[data-testid="favorites-minimap"]` is present while the chart overflows its pane.

## Harness

`runFavoritesSuite` in `harness/lib/flows.ts`. Skips when `/favorite-pokemon-by-type` is the SPA fallback. Checks: hub card, grid boot, empty balls inside their cells, last Unova Electric row centred, picker sprites at the dex six-column size with a six-sprite row inside the sheet, Gen 1 starters as `6+3`, Gen 4 legendaries as `5+5+4`, Gen 1 Water as `6+6+6+6+4+4`, a short mobile sheet shorter than the cap with the grid still above it, packing vacate opacity under 0.5, a trash slot with a black outline, a red mark, and a faded sprite of the Pokémon that leaves, store `fairy|2` = Togetic and `water|2` = Azumarill before a chain is chosen. After that choice, `fairy|2` is Azumarill and Togetic is gone. An empty Rock cell takes Golem from Ground with Nidoking left on Poison and no packing sheet. The empty-cell focus ring sits above the ball, the filled sprite sits above the ring, the selector ring stays inside the sheet, the clear control is a grid cell, a used Pokémon carries a type mark, each selector Pokémon shows its own type icons inside the cell, and the minimap shows only while the chart overflows. A chain longer than four links uses stepped mode: two links, then the next two after a branch. The longest real keep-everyone chain is 17 links (Gen 3, Normal, incoming 263) and the list is those two chains.
