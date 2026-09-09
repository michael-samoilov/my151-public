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

## After the launch of the hub and the gym leader maker

- **Translate the hub and the gym leader maker.** Every `home.*`, `faq.*`
  and `promo.*` key, and the league's hardcoded tool bar, picker, hint and
  export strings, are English in every locale. Needs the network-bound
  i18n pipeline. Add the two pages to `e2e/dev/unextracted.spec.ts` once
  the league's strings go through the catalog.
- **`header.toolName` in nine locales.** The English value is now "Custom
  Pokédex Builder" and the other catalogs fall back to it; translate or keep.
- **Measure the ace slot without CSS `zoom`.** `useSlotLayout` in
  `src/league/components/CardGrid.tsx` divides text measured through a zoom
  back out; a browser that snaps glyph advances to whole pixels lands the
  ace 0.59 px off. Playwright is pinned to full Chromium so CI matches
  local runs, but the solver still depends on it.
- **The favorite Pokémon picker page**, `/favorite-pokemon-by-type`. Copy
  is in `docs/seo/LAUNCH-COPY.md`; the hub gains one entry in `useTools()`.
- **A hub view in the admin dashboard from the journal.** The Tools card
  reads the funnel counters; the per-day journal has the cids for a
  distinct-browser read of each hub card.

## Done

- **Body shape, color, and egg group filters** — shipped as their own filter
  sheets in `PokemonBrowser.tsx` (`browser.sheet.shape`, `.color`, `.eggGroup`),
  backed by `SHAPE_NAMES`, `COLOR_NAMES`, and `EGG_GROUP_NAMES` in
  `src/types/pokemon.ts`. `scripts/add-shapes.mjs` and
  `scripts/add-color-egg.mjs` populate the data from the cached PokeAPI CSVs.
