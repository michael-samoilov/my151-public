# Standard surfaces (the invariant suite)

The engine- and feature-independent checks every change re-runs. If any fail, the
build is broken for that surface regardless of what the change intended.

## Sub-features

- Boot: the SPA mounts React into `#root` on every engine.
- No horizontal page scroll (`scrollWidth <= innerWidth`) and a non-trivial
  painted area.
- The persistence oracle round-trips: a dex written to localStorage rehydrates.
- The seeded grid renders sprites.
- Tab navigation: each of builder / analytics / view activates when clicked; the
  builder list scrolls.
- No JS errors: no uncaught error or ErrorBoundary crash over the run.
- A real add mutates the store (desktop Blink; skips until a card test-id exists).

## How to get to it (user POV)

Load the app at `/`. The builder tab is default. The header shows the three tabs.
Analytics is locked until 25 Pokémon are placed (sticky once unlocked).

## Driving it with the harness

`runStandardSuite` in `harness/lib/flows.ts` runs all of the above on any
`Session`. It seeds a 37-Pokémon dex (real assignments from `src/data/demoDex.ts`)
through localStorage, which is engine- and build-agnostic, then asserts the
oracle, sprite render, tab activation (`aria-selected`, with a non-transparent
background as fallback), a shared tablist track rather than a lone primary
button, 4-digit count clearance, and scroll. Personas assert their identity
first.

## Gotchas

- `?demo=151` and `?tune` are Vercel-preview / dev-only; local `vite preview` has
  neither, which is why seeding goes through localStorage, not those flags.
- Analytics only appears as a real nav once 25+ are placed; the seed clears that
  bar so the analytics tab is drivable.
- The active-tab signal is `aria-selected`, with computed `background-color`
  as a fallback, so it survives Tailwind class churn and works on all three
  engines. The selected tab is not a primary-filled lone button.
