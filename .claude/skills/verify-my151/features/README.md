# my151 feature map

One file per user-facing feature, from the user's point of view: what it is, how
to reach it, how to drive it with the harness, and what observable end state
proves it works. The harness's standard suite (`harness/lib/flows.ts`) re-checks
`standard-surfaces` on every run. The other files are the per-feature detail a
change-specific flow builds on.

my151.app is a multi-page app. The hub is at `/`, the pokedex builder with its
view and analytics tabs at `/pokedex-builder`, and the Pokémon League Builder at
`/custom-gym-leader`. Feedback and the language picker sit in the header of
every page. The admin dashboard is at `/?admin`. The favorite Pokémon picker is at
`/favorite-pokemon-by-type`. Grow this list with the app and keep it honest with
`/maintain-verification-skill`.

| Feature | File | Owner (source) |
| --- | --- | --- |
| Standard surfaces (the invariant suite) | `standard-surfaces.md` | `src/App.tsx`, `src/components/layout/Header.tsx` |
| Hub | `hub.md` | `src/home/main.tsx`, `src/components/home/HomePage.tsx` |
| Build the dex (place Pokémon) | `build-and-place.md` | `src/components/pokedex/PokedexGrid.tsx` |
| Browse, filter, pick | `browse-and-filter.md` | `src/components/browser/PokemonBrowser.tsx` |
| View and export the finished dex | `view-and-export.md` | `src/components/view/ViewPage.tsx` |
| Analytics dashboard | `analytics.md` | `src/components/analytics/AnalyticsDashboard.tsx` |
| Pokémon League Builder | `league-builder.md` | `src/league/LeagueApp.tsx`, `src/league/components/CardGrid.tsx` |
| League and trainer card export | `league-export.md` | `src/league/components/LeagueExportOverlay.tsx` |
| Feedback form | `feedback.md` | `src/components/feedback/FeedbackSheet.tsx` |
| Language picker | `language.md` | `src/components/layout/LanguagePicker.tsx`, `src/i18n/` |
| Admin dashboard | `admin.md` | `src/components/admin/AdminPage.tsx` |
| Favorite Pokémon picker | `favorite-picker.md` | `src/favorites/FavoritesApp.tsx`, `src/favorites/components/FavoritesGrid.tsx` |

## Stable handles

- Nav tabs (dex page): `[data-nav="builder"]`, `[data-nav="analytics"]`,
  `[data-nav="view"]`. Active tab = the one whose computed `background-color`
  is non-transparent. Header lanes: `[data-testid="tool-title"]` and
  `[data-testid="tool-actions"]`.
- Builder: the scroll container `[data-build-scroll]`, sections
  `[data-section-id]`, and each section's `[data-add-slot]` (not Starters).
- Browser: `[data-testid="type-filter"]`, `[data-result-count]`,
  `[data-filter-chip]`, `[data-testid="verify-evo-card"]`, and
  `[data-testid="browser-close"]`.
- Bottom sheet: `[data-overlay]` around a `role="dialog"`, below 1024px only.
  Desktop shapes differ by feature.
- State oracle: localStorage `personal-151-pokedex-v3`, a zustand-persist blob
  `{state:{sections:{groupId:number[]},locale,…},version:10}`. `sections` is
  the source of truth for a build. `locale` holds the language picker's choice.
- League builder: see `league-builder.md`. Its oracle is the `league-builder`
  localStorage key.
- Favorite picker: see `favorite-picker.md`. Its oracle is the `favorite-picker`
  localStorage key.

The three dex tabs are React state, not URL-addressable, so navigate by clicking
`[data-nav]`, never by deep link. Most `aria-label`s are i18n-templated. Do not
select on their text.
