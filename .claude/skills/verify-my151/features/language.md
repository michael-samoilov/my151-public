# Language picker

A globe menu in the header of every page that switches the UI among nine
locales.

## Sub-features

- Nine locales: `en`, `ja`, `ko`, `zh-Hans`, `zh-Hant`, `fr`, `de`, `es`, and
  `it` (`src/i18n/config.ts`).
- The menu lists each locale by its own name, in a `span[lang]`.
- A pick loads the catalog first, then saves `state.locale` in
  `personal-151-pokedex-v3`. Every page on the origin reads that value.
- At start-up, `?lang=` beats the saved choice, which beats
  `navigator.languages`.

## How to get to it (user POV)

Tap the globe (`button[aria-haspopup="menu"]`) in the header of the hub, the
dex, or the league. Pick a row (`[role="menuitemradio"]`). The current locale's
row has `aria-checked="true"`.

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
- The hub, the dex, and the league each set `<html lang>` from the locale
  (`useDocumentLocale` in `HomePage.tsx`, `App.tsx`, and `LeagueApp.tsx`). The
  admin page (`/?admin`) is English-only, so it keeps the `lang="en"` of
  `index.html`.
- Few strings are translated: game terms (types, egg groups, colors, regions),
  Pokémon names, and the four feedback chips (`src/i18n/catalogs/ui/`). Other
  keys, including the hub's `home.*` copy, fall back to English. Assert a
  switch on those strings or on the store.
- Pseudo-locales through `?lang=` exist only where `PREVIEW_FEATURES` is on: a
  Vercel preview or the dev server.
- A seed without `locale` follows the engine's language, which differs across
  Blink, WebKit, and Gecko.
