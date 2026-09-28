# Pokémon League Builder

A second tool at `/custom-gym-leader`: fourteen gym cards, each a grid of
evolution lines over 11 level rows (gyms 1-8, Elite Four, Champion, Endgame
boss). Each card has an ace, a partner, a TM, a badge, powerups on rows 9-11,
and a legendary on the boss row.

## Sub-features

- A league home lists the fourteen slots. On a non-production build, a first
  visit seeds a Kanto league with slots 6 and 9 blank. Production opens empty.
- Story / Rematch tabs (`[data-testid="league-nav"]`) switch every row between
  the challenge team and the rematch team. Active tab =
  `aria-selected="true"` on `[data-league-view]`.
- An empty cell opens the Pokémon browser to seat a line. A filled cell opens
  it to replace that seat's line. A filled boss-row cell opens the legendary
  picker instead.
- The ace and partner slots open one-Pokémon pickers with standalone tiles.
- A cell dragged up or down moves an evolution boundary. A press and hold lifts
  the column to reorder it. The moving stage wears a wash of its primary type.
- Mega and Gigantamax buttons on rows 9-11, the bottom three. A press sets its
  row and every row below it that shows the same form on that seat.
- Desktop (1024px and wider) opens on the league pane alone. Opening a gym
  splits the width in halves with the card, and the picker makes thirds.
  Content widths follow the pane. One compact page footer sits below the fold.
- The league persists under the `league-builder` localStorage key.

## How to get to it (user POV)

Open `/custom-gym-leader` and tap a slot (`[data-testid="league-slot-N"]`).
Cells are `[data-testid="card-cell-<row>-<seat>"]`. The ace and partner slots
are `[data-testid="slot-ace"]` and `[data-testid="slot-partner"]`. The browser
shows a `[data-filter-chip="my-dex"]` chip, and its tiles are
`[data-testid="verify-evo-card"]`. Powerup buttons sit beside a cell as
`[data-powerup="mega"|"dynamax"]`. Export has its own file, `league-export.md`.

## Driving it with the harness

`verify.ts` runs six league suites after `standard`:

- `league`: checks the served shell's title, h1, and canonical link
  structurally, then boot, layout, the 44px `[data-testid="league-tool-bar"]`,
  render audits, and a desktop Blink drive (gym type, one line) read back from
  the store.
- `league-change`: on every engine, seeds a blank league, then checks the tab
  set, the ace picker's rows, powerup presses (`state.cards[9].powerups`), a
  replace, a synthetic-touch flick and its `[data-stage-tint]` wash, TM search,
  and the Elite Four stars on one row.
- `league-hover`: a column wash on desktop hover, and none left behind on touch.
- `league-home`: slot moves on the home (fill, displace, playlist order).
- `gym-card-export`: the card export preview, and ace, TM, and badge fit.
- `league-funnel`: the export nudges (`[data-testid="league-nudge"]`). Its
  `data-league-nudge` is `card` for a full trainer card, `league` for eight
  gym leaders with a card still empty, and `complete` for every card filled.
  The two roster popups never cover a summary row: `data-nudge-placement`
  is `beside` where the pane has room right of the summary (a desktop) and
  `below` elsewhere, where the popup joins the page flow and the fit shrinks
  the summary to make room. The league Export button carries
  `data-nudge-pulse` while one shows. It also loads a full v3 save that saw the eight-gym popup and checks the
  store: version 4, `complete` celebrated, and no popup.

The oracle is the store: `state.cards[i].lines[j].branch` and `.boundaries`,
and `.powerups[row]`.

## Gotchas

- Seed a blank league before a drive. The Kanto seed fills card 3, so a drive
  that sets its type finds `aria-label="Gym type: <type>"`, not the bare label.
- An engine that cannot construct a `Touch` or `TouchEvent` skips the two flick
  checks by name: desktop Gecko under Xvfb has no constructor, and WebKitGTK
  throws on construction. A real finger on a device is the only proof there.
- Each check phase reloads the page to close the picker, because the Session
  interface has no keyboard.
- The ace picker is windowed: Eevee's row is not in the DOM until the results
  scroll to it, so the check scrolls in steps and re-queries.
- WebKitGTK does not scale rem-sized boxes inside the card's CSS `zoom`
  (`useFitScale`). The fit then drops to its 0.55 floor, the ace sprite
  overflows its slot, the ace and partner hit boxes overlap, and the TM and
  badge boxes overflow. On production that fails 6 `gym-export:*` checks, and
  the `league-change` and `league-home` suites stop at a WebKit click or move
  error. Safari 26.4 to 26.6 shipped zoom fixes, so check a real Safari
  before you call it an app bug: with a card open, compare
  `[data-ace-partner-slot]` height / (12.75 × root rem) with the card's zoom.
- Headless Firefox reports no hover-capable pointer, so
  `league-hover:desktop-column-wash` skips on Gecko by name. A desktop
  browser with a mouse is the proof.
- The harness's desktop surfaces run at a device pixel ratio of 1. There
  every league sprite draws at a non-integer scale on all engines, because the
  fit zoom scales the pixel art (at 1280px a 96px sprite draws 36.48px on
  Blink and 37.27px on Gecko), and below 1x it is smoothed
  (`image-rendering: auto`). Do not report either as an engine difference.
- At a device pixel ratio of 2 or more (a Retina desktop), the league summary
  holds its sprites at exactly 1x instead, and gives up its own spacing to
  keep all 14 rows on screen (`src/league/homeLayout.ts`). No harness surface
  runs there; `e2e/league-sprite-scale.spec.ts` covers it on Blink.
- The league render audits wait for every visible image to load first. At
  hydration most sprites are still loading, and an early audit counted 6, 51
  or 37 warnings on the same build.
