# Language picker

A globe menu in the header of every page that switches the UI among nine
locales.

## Sub-features

- Nine locales: `en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`, `fr`, `de`, `es`, and
  `it` (`src/i18n/config.ts`).
- The menu lists each locale by its own name, in a `span[lang]`.
- A pick loads the catalog first, then saves `state.locale` in
  `personal-151-pokedex-v3`. Every page on the origin reads that value. Demo
  mode saves it under the demo key instead (`POKEDEX_STORAGE_KEY` in
  `src/lib/demoMode.ts`).
- At start-up, `?lang=` beats the saved choice, which beats
  `navigator.languages`.

## How to get to it (user POV)

Tap the globe (`button[aria-haspopup="menu"]`) in the header of the hub, the
dex, the league, or the favorite picker. Pick a row (`[role="menuitemradio"]`).
The current locale's row has `aria-checked="true"`.

## Driving it with the harness

The harness does not drive the picker. Its seed pins `locale: 'en'`, so each
engine's own `navigator.languages` cannot change a label the flows read. The
repo's `e2e/language-negotiation.spec.ts` and
`e2e/dev/language-picker.spec.ts` cover negotiation and the picker.

Manual drive (a Playwright script, local build):

1. On `/pokedex-builder`, open the globe and pick `de`.
2. Assert that `aria-checked="true"` moved to that row and that `state.locale`
   reads `de`.
3. Assert that `<html lang>` changed.
4. Open `/` and `/custom-gym-leader`, and confirm that the pick holds.

## Gotchas

- `?lang=<id>` needs an exact locale id (`zh-Hans`, not `zh`), and the app does
  not save it. It applies to that page load only.
- The hub, the dex, the league, and the favorite picker each set `<html lang>`
  from the locale (`useDocumentLocale` in `HomePage.tsx`, `App.tsx`,
  `LeagueApp.tsx`, and `FavoritesApp.tsx`). The admin page (`/?admin`) is
  English-only, so it keeps the `lang="en"` of `index.html`.
- Game terms (types, egg groups, colors, regions) and Pokémon names are
  sourced from the games. Each locale overlay in `src/i18n/catalogs/ui/` adds
  about 132 translated keys, 15 of them `home.*`. They cover the feedback
  chips, trainer card headings, the picker, and most hub copy. Other keys fall
  back to English. Assert a switch on translated strings or on the store.
- While the menu is open, both chip grids are in the DOM: the desktop dropdown
  and the portaled phone sheet. Filter `[role="menuitemradio"]` to the visible
  rows.
- The globe's accessible name is translated. Match
  `button[aria-haspopup="menu"]`, not its name.
- Pseudo-locales through `?lang=` exist only where `PREVIEW_FEATURES` is on: a
  Vercel preview or the dev server.
- A seed without `locale` follows the engine's language, which differs across
  Blink, WebKit, and Gecko.
