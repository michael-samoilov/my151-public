# Build the dex (place Pokémon)

The core job: fill the builder's sectioned slots with Pokémon until the dex is
complete (151).

## Sub-features

- Add a Pokémon to a section from the empty "+" slot.
- Sections group the dex (Starters, Forest, Legendary, and the rest from
  `src/data/slot-template.ts` `BUILD_GROUPS`).
- Progress drives milestones at 25 / 100 / 151 and unlocks analytics at 25.
- The dex persists across reloads.

## How to get to it (user POV)

The builder tab (`[data-nav="builder"]`) is the default view. Each section shows a
dashed "+" button (`aria-label="Add a Pokémon to Starters"` and templated
siblings). Tapping it opens the browser to pick a Pokémon.

## Driving it with the harness

The observable end state is the localStorage store: after a placement,
`personal-151-pokedex-v3` `state.sections[groupId]` gains the Pokémon's id, and the
grid renders one more sprite. The standard suite seeds a known dex through
localStorage and asserts the round-trip and sprite render. For a real-user-path
proof, click the section's add button, pick a Pokémon in the browser (see
`browse-and-filter.md`), and assert the section array grew by one.

## Gotchas

- Seed through localStorage, not `?demo`/`?tune` (preview-only). Write
  `{state:{sections,…},version:10}` and reload.
- The persist store version is 10; a stale version triggers `migrate` in
  `usePokedexStore.ts`, which reshapes sections.
- Placement targets the section whose add button was clicked; the picker does not
  ask which section.
