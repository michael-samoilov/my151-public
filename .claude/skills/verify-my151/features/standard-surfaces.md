# Standard surfaces (the invariant suite)

The engine- and feature-independent checks every change re-runs. If one fails,
the build is broken on that surface, whatever the change intended.

## Sub-features

- Boot: React mounts into `#root` at `/pokedex-builder` on every engine.
- Layout: no horizontal page scroll (`scrollWidth <= innerWidth`) and a
  non-trivial painted area.
- The persistence oracle round-trips: a dex written to localStorage rehydrates,
  and the seeded grid renders sprites.
- Tabs: builder, analytics, and view each activate when clicked, and the
  builder list scrolls.
- Header lanes (`header:<tab>-no-overlap`): on each tab, the right edge of the
  title's text (`[data-testid="tool-title"]`) ends before the nav starts. The
  nav ends before the first control in `[data-testid="tool-actions"]`.
- Render audits: no clipped, cut, or truncated content on the seeded grid and on
  each tab (`render:*-no-clipped-content`).
- A real add grows the store (`placement:real-add-grows-store`, desktop Blink).
- No JS errors: no uncaught error or ErrorBoundary crash over the run.

## How to get to it (user POV)

The dex builder is at `/pokedex-builder`. The hub is at `/` (see `hub.md`). The
builder tab is the default. The header shows the three tabs. Analytics is
locked until 25 Pokémon are placed and stays unlocked after that.

## Driving it with the harness

`runStandardSuite` in `harness/lib/flows.ts` runs all of the above on any
`Session`. Before boot it sets `p151-league-promo-seen`,
`p151-moved-notice-seen`, and `p151-favorites-launch-seen`. The moved-notice
key gates no prompt. It only marks the session as a returning visitor. The
launch key keeps the October 6-13, 2026 picker callout off the header. It
seeds a 37-Pokémon dex (real assignments from `src/data/demoDex.ts`) through
localStorage. The seed pins `locale: 'en'`, so an engine's own
`navigator.languages` cannot change a label. It asserts tab activation
(`aria-selected`, with a non-transparent background as fallback), a shared
tablist track, and 4-digit count clearance. The real add clicks
`[data-section-id="meadow"] [data-add-slot]`, then the first
`[data-testid="verify-evo-card"]`, and reads the placed count. It runs on
desktop Blink, where a card click adds immediately. Other surfaces skip it by
name. Personas assert their identity first.

## Gotchas

- `?demo=151` works on every non-production build, local `vite preview`
  included. Demo mode persists under `personal-151-pokedex-demo`, not
  `personal-151-pokedex-v3`, so the suite seeds the real key without the flag.
  A Vercel preview is in demo mode without the flag.
- `?tune` works only off production, because the production deploy ignores it.
  It exposes `window.__pokedexStore`.
- The Starters section has no `[data-add-slot]`, so a drive uses another
  section's add slot (see `build-and-place.md`).
- The active-tab signal is `aria-selected`, with the computed
  `background-color` as a fallback, not a class name, so it survives Tailwind
  class churn and reads the same on all three engines.
- Analytics is a real nav only at 25 or more placed. The 37-Pokémon seed clears
  that bar.
