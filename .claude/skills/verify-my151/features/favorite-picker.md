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

`runFavoritesSuite` in `harness/lib/flows.ts`. Skips when `/favorite-pokemon-by-type` is the SPA fallback. Checks: hub card, grid boot, last Unova Electric row centred, packing vacate opacity under 0.5, store `fairy|2` = Togetic and `water|2` = Azumarill before a chain is chosen.
