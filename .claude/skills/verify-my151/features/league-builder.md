# Pokémon League Builder

A second tool at `/pokemon-league-builder`: fourteen gym cards, each a grid of
evolution lines over twelve level rows, with an ace, a partner, a TM, a badge,
powerups on the top three rows, and a legendary on the endgame boss row.

## Sub-features

- A league home lists the fourteen slots; a first visit seeds a Kanto league
  with two blank cards (slots 6 and 9).
- A card seats evolution lines from the Pokémon browser, opened from an empty
  cell; a filled cell opens the browser to replace that seat's line.
- The ace and partner slots open one-Pokémon pickers with standalone tiles.
- A cell dragged up or down moves an evolution boundary; a press and hold
  lifts the column to reorder it. The moving stage wears a wash of its
  primary type while it moves.
- Mega and Gigantamax buttons on the elite, champion and boss rows; a press
  sets its row and every row below that shows the same form on that seat.
- The card persists under the `league-builder` localStorage key.

## How to get to it (user POV)

Open `/pokemon-league-builder`, tap a slot (`[data-testid="league-slot-N"]`).
Cells are `[data-testid="card-cell-<row>-<seat>"]`; the ace and partner slots
are `[data-testid="slot-ace"]` and `[data-testid="slot-partner"]`. The browser
sheet shows a `[data-filter-chip="my-dex"]` chip when open, and its tiles are
`[data-testid="verify-evo-card"]`. Powerup buttons sit beside a cell as
`[data-powerup="mega"|"dynamax"]`.

## Driving it with the harness

`runLeagueSuite` proves boot, the static SEO shell, layout and one desktop
Blink drive (type, line, TM). `runLeagueChangeSuite` drives the 2026-09
changes on every engine: it seeds a blank league by writing the store key and
reloading, then reads the picker heading, packs the ace picker's Generation 1
rows around Eevee and asserts no empty cell sits before a tile, presses the
Mega button twice and reads `state.cards[9].powerups`, replaces a Lapras seat
with the Charizard line already on the card, and flicks Charizard's top cell
two rows up with synthetic `TouchEvent`s, reading the boundary and the
`[data-stage-tint]` cells while the touch is down. The oracle is the store:
`state.cards[i].lines[j].branch` and `.boundaries`, and `.powerups[row]`.

## Gotchas

- Seed a blank league before a drive; the Kanto seed fills card 3, so a drive
  that sets a type on it finds `aria-label="Gym type: <type>"`, not the bare
  label.
- The flick is a synthetic touch dispatched on the cell, which the card's
  own sensor handles. An engine with no `TouchEvent` constructor (desktop
  Gecko under Xvfb) skips those two checks by name; a real finger on a device
  is the only proof there.
- Each check phase reloads the page to close the picker, because the Session
  interface has no keyboard.
- The ace picker is windowed: Eevee's row is not in the DOM until the results
  container is scrolled to it, so the check scrolls in steps and re-queries.
