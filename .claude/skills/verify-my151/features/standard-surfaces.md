# Standard surfaces (the invariant suite)

The engine- and feature-independent checks every change re-runs. If any fail, the
build is broken for that surface regardless of what the change intended.

## Sub-features

- Boot: the SPA mounts React into `#root` on every engine.
- No horizontal page scroll: `documentElement.scrollWidth <= innerWidth` (the repo
  forbids body horizontal scroll).
- The persistence oracle round-trips: a dex written to localStorage rehydrates.
- The seeded grid renders sprites.
- Tab navigation: each of builder / analytics / view activates when clicked.
- The builder list scrolls.

## How to get to it (user POV)

Load the app at `/`. The builder tab is default. The header shows the three tabs.
Analytics is locked until 25 Pokémon are placed (sticky once unlocked).

## Driving it with the harness

`runStandardSuite` in `harness/lib/flows.ts` runs all of the above on any
`Session`. It seeds a 37-Pokémon dex (real assignments from `src/data/demoDex.ts`)
through localStorage, which is engine- and build-agnostic, then asserts the
oracle, sprite render, per-tab activation (via computed background color), and
scroll. Personas assert their identity first.

## Gotchas

- `?demo=151` and `?tune` are Vercel-preview / dev-only; local `vite preview` has
  neither, which is why seeding goes through localStorage, not those flags.
- Analytics only appears as a real nav once 25+ are placed; the seed clears that
  bar so the analytics tab is drivable.
- The active-tab signal is computed `background-color`, not a class name, so it
  survives Tailwind class churn and works identically on all three engines.
