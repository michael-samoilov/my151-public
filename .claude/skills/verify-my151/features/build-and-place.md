# Build the dex (place Pokémon)

The core job: fill the builder's sectioned slots with Pokémon until the dex is
complete (151).

## Sub-features

- Add an evolution line to a section from the section's dashed "+" slot.
- Sections group the dex (Starters, Forest, Meadow, Legendary, and the rest of
  `BUILD_GROUPS` in `src/data/slot-template.ts`).
- Progress drives milestones at 25, 100, and 151. Analytics unlocks at 25, and
  the detailed export stats at 100.
- The dex persists across reloads.

## How to get to it (user POV)

Open `/pokedex-builder`. The builder tab (`[data-nav="builder"]`) is the
default view. Each section (`[data-section-id="<groupId>"]`) ends in a dashed
"+" slot (`[data-add-slot]`). Tapping it opens the Pokémon browser for that
section. On desktop (1024px and wider), a card click adds its line
immediately. On a phone, taps stage the picks, and a floating button commits
them and closes the sheet.

## Driving it with the harness

The observable end state is the localStorage store:
`personal-151-pokedex-v3` `state.sections[groupId]` gains the line's ids, and
the grid renders the new tiles (`[data-tile-id="<groupId>::<id>"]`). The
standard suite seeds a known dex and asserts the round-trip and the sprite
render. Its `placement:real-add-grows-store` check is the real-user-path proof.
On desktop Blink it clicks `[data-section-id="meadow"] [data-add-slot]`, then
the first `[data-testid="verify-evo-card"]`, and asserts the placed count grew.
Close the desktop browser with `[data-testid="browser-close"]`.

## Gotchas

- A pick adds the whole evolution line, so a section grows by the line's member
  count, not by one. An add also takes the same ids out of other sections and
  removes exclusive forms, so read the target section, not only the total.
- The Starters section has no `[data-add-slot]`. Below three chains it shows
  type placeholders that open the browser for that starter type. From three
  chains up it shows a "+" with a hard-coded English `aria-label`. Drive
  another section.
- Seed through localStorage: write `{state:{sections,…},version:10}` and
  reload. A stale version runs `migrate` in `usePokedexStore.ts`, which
  reshapes sections.
- Demo mode (`?demo=151`, or any Vercel preview) persists under
  `personal-151-pokedex-demo` (`src/lib/demoMode.ts`), so a seed under the v3
  key does not show there.
- Placement targets the section whose add slot was clicked. The picker does not
  ask which section.
