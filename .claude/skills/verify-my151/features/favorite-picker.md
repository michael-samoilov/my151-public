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

## Harness

`runFavoritesSuite` in `harness/lib/flows.ts`. Skips when `/favorite-pokemon-by-type` is the SPA fallback. Checks: hub card, grid boot, empty balls inside their cells, last Unova Electric row centred, picker sprites at the dex six-column size with a six-sprite row inside the sheet, Gen 1 starters as `6+3`, Gen 4 legendaries as `5+5+4`, Gen 1 Water as `6+6+6+6+4+4`, a short mobile sheet shorter than the cap with the grid still above it, packing vacate opacity under 0.5, a trash slot with a black outline, a red mark, and a faded sprite of the Pokémon that leaves, store `fairy|2` = Togetic and `water|2` = Azumarill before a chain is chosen.
