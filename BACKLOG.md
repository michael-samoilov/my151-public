# Backlog

Ideas and feature requests not yet scheduled. Keep entries small and
self-contained. Promote an entry to a work branch when you pick it up, and move
it to "Done" when it ships.

## Selection pane filters

### Unofficial / fanbase categorizations (selection-pane-only)

Add community categorizations that surface **only as selection pane filter
options**, not as buildable Build-page sections (`DexSection`). They behave like
the existing `ARCHETYPES` browse filters (Places, Game Mechanics): a curated ID
list per group, not a predicate.

Candidate groupings:

- **Fluffymons** — fluffy or fuzzy designs (Mareep line, Swablu, Cottonee,
  Whimsicott, Eldegoss, Stufful, Bewear).
- **Round mons** — the "perfectly round" silhouette (Voltorb, Electrode,
  Jigglypuff, Igglybuff, Qwilfish, Snom, Appletun, Gulpin, Solosis).
- **Gorilla-arm dragons** — the 4chan observation about dragon designs with
  oversized arms. **Undecided: confirm before you build it.** The grouping is
  meme humor and its boundary is unclear. If it stays, give it a neutral display
  name.

Open questions:

- Each group needs a maintained membership list. Decide whether it lives in
  `archetypes.ts` or in a new `fan-categories.ts` that keeps meme groupings
  separate from the official-looking ones.
- Add the groups to a filter sheet in `PokemonBrowser.tsx`. Exclude them from
  anything that turns an archetype into a Build-page section.
- Check the tone of any meme-sourced name before it ships as a visible label.

### Remaining official Pokédex classifications

Shape, color, and egg group already ship (see "Done"). These official
classifications are still unused:

- **Habitat** — the Kanto-dex habitat list.
- **Genus** — the species category, such as "Mouse Pokémon".

Neither field exists on `pokemon.json` today. Both need a sourced, idempotent
patch script like `scripts/add-color-egg.mjs`, plus new fields on the `Pokemon`
interface. Habitat covers Gen 1 species only, so decide how the filter behaves
for the other 900+ species before you build it.

## Done

- **Body shape, color, and egg group filters** — shipped as their own filter
  sheets in `PokemonBrowser.tsx` (`browser.sheet.shape`, `.color`, `.eggGroup`),
  backed by `SHAPE_NAMES`, `COLOR_NAMES`, and `EGG_GROUP_NAMES` in
  `src/types/pokemon.ts`. `scripts/add-shapes.mjs` and
  `scripts/add-color-egg.mjs` populate the data from the cached PokeAPI CSVs.
