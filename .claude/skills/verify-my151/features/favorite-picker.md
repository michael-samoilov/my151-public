# Favorite Pokémon picker

A grid of type columns by generation rows at `/favorite-pokemon-picker`. The
old `/favorite-pokemon-by-type` path answers with a 308 redirect to it. The
user picks one favorite Pokémon per cell. Extra columns and rows hold starter,
gimmick, legendary, and favorite picks.

## Sub-features

- Grid: 18 type columns plus starter, legendary, gimmick, and favorite; 9
  generation rows plus gimmick, legendary, and favorite. Each body cell is a
  `[data-testid="favorites-cell-<type>-<gen>"]` button whose `data-kind` is
  `pick`, `pointer`, `disabled`, or `null`. An empty cell shows a faint ball
  `[data-testid="favorites-empty-ball"]` whose `data-ball` is `poke` in a pick
  cell, `ultra` in a pointer cell, and `master` in favorite × favorite. The
  Master Ball's domes rise past its outline but stay inside the cell.
  The extra headers, selector titles, and source badges show white-tile icons
  `[data-testid="favorites-axis-icon-<id>"]`: three Poké Balls (starter), the
  Mega, Dynamax, Z-Move, and Terastal marks (gimmick), Arceus's ring
  (legendary), and a laurel (favorite). The SVGs live in `src/favorites/icons/`.
  Filled sprites may extend past their cell borders.
- Grid frame `[data-testid="favorites-grid-scroll"]`: fills the screen below the
  two page headers and scrolls on both axes. The header row and generation
  column are sticky inside it.
- Zoom: a two-finger pinch, a Safari gesture, or ctrl+wheel over the frame zooms
  the grid, not the page. `data-zoom` on the frame holds the factor, 1 to 4 on
  mobile and 1 to 2.5 on desktop. Body cells scale fully. The sticky headers
  grow to at most 1.25 times their zoom-1 size. A pinch draws each frame with
  transforms and lays the grid out once when it ends; the headers grow with
  the pinch, so nothing moves when the fingers lift.
- Minimap `[data-testid="favorites-minimap"]`: sits in the frame's bottom-right
  corner with no transform. It draws body cells only, shows filled and empty
  cells differently, and shows while the grid scrolls or zooms. On every
  surface, it fades 1200 ms after the last scroll, zoom, or drag. Its window
  `[data-testid="favorites-minimap-viewport"]` uses the site red. It is hidden
  when the whole grid fits. On desktop, a pointer that rests on it for 200 ms
  shows it, and a drag of its window scrolls the grid. A quick click there
  still reaches the cell under it. Below 1024px, it takes touches only while
  it shows. A finger drag on it scrolls the grid on both axes. A press off the
  window centers the window under the finger first. A faded minimap lets a tap
  reach the cell under it.
- Selector `[data-testid="favorites-picker"]`: a bottom sheet below 1024px, a
  pane inside the grid next to the tapped cell on desktop. The pane scrolls
  with the grid, and the sticky headers paint over it. The desktop pane has no
  close button: Escape or a click outside it closes it, and that click opens no
  cell. The phone sheet closes by a drag down, a tap on its header, or a tap
  outside it. Sprites `[data-testid="favorites-pick-<id>"]` sit in rows of up
  to six; a short last row is centered. A tall selector shrinks its sprites to
  fit the phone pane.
- Clear: the current pick is translucent, with a red x
  `[data-testid="favorites-clear"]` centered over it. Tapping it clears the
  cell.
- Name tip `[data-testid="favorites-name-tooltip"]`: a dark tip with the
  Pokémon's name over a filled grid cell or a selector sprite. A mouse hover
  opens it after 200 ms. A finger held still for 450 ms opens it until the
  finger lifts. That release does not pick, open, or clear. A move of more
  than 10 px, a scroll, or a second finger before 450 ms opens no tip.
- Pointer cells (favorite row and column, legendary × legendary, gimmick ×
  gimmick): list picks
  from other cells, with source badges `[data-testid="favorites-pointer-mark"]`.
  With nothing to point at, the selector shows a "?" Unown empty state
  `[data-testid="favorites-empty-unown"]`.
- Already selected: origin indicators identify other cells that hold a Pokémon.
  Shared coordinates are omitted in the current selector context. These
  indicators are informational; repeated picks stay bright and preserve every
  independent source. Selecting the current cell's Pokémon still clears it.
- Repeat picks are always allowed. There is no No Repeats setting or settings
  gear. The old persisted setting is ignored without deleting saved picks.
  Pointer pools and unsupported-pointer pruning retain their rules.
- The eye and localized Hide Icons / Show Icons action share one row with the
  selector badges. It hides both type chips and origin indicators in all cells.
  Mobile spacing tightens before title badges scale proportionally to fit.
- Special word badges contain centered text without white symbols. Standalone
  special origin icons retain their symbols. The packing sheet
  `[data-testid="favorites-packing"]` stays off for users.
- Completion counter `[data-testid="favorites-completion"]` in the page header
  shows the filled count, such as `12/257`.
- Completion popup: the first time the grid becomes complete, a popup points
  at Export and sends a `nudge-shown` beacon. It plays once per browser
  (`personal-151-favorites-complete-nudge-v1`). A grid that is already complete
  on load counts as celebrated.
- Export: `[data-testid="favorites-export-open"]` in the page header opens the
  export settings. Two modes, `[data-favorites-export-mode="full"|"simplified"]`
  (**Full grid** and **Summary**), carry `aria-pressed`. The full mode adds a
  detailed-stats checkbox, `[data-testid="favorites-export-stats"]`.
  `[data-testid="favorites-export-save"]` saves.
- Analytics tab: the header tablist holds the grid tab and
  `#favorites-tab-analytics` (`role="tab"`, `aria-selected`). The dashboard
  `[data-testid="favorites-analytics"]` mounts on the first visit to that tab.

## How to get to it (user POV)

Tap the **Favorite Pokémon Picker** card on the hub at `/`, or pick it from the
Tools menu. Tap a cell to open its selector, then tap a Pokémon.

## Driving it with the harness

`runFavoritesSuite` in `harness/lib/flows.ts` runs on every surface. It skips
when `/favorite-pokemon-picker` serves the SPA fallback. It checks the hub
card, grid boot, empty-ball fit, selector row centering and sprite size, the
short sheet, tall-selector fit, packing staying off, direct replacement and
trash swap, store writes, sprite overflow, selection rings, the clear x, type
and pointer badges, minimap structure and fade, and app zoom (cell growth, far
corner inside the frame, sticky headers on the frame edges, untransformed
minimap in the frame). Last, it seeds 256 of 257 cells, clears the popup key,
and fills the last cell. The popup must show at `257/257`
(`favorites:complete-popup-shown`), point its arrow at Export
(`complete-popup-points-at-export`), and post one `nudge-shown` beacon
(`complete-popup-beacon`).

Manual drive (a Playwright script, local build):

1. Seed localStorage `favorite-picker` with
   `{"state":{"fills":{"fire|1":6}},"version":3}` and open
   `/favorite-pokemon-picker`.
2. Click `[data-testid="favorites-cell-water-1"]`, then
   `[data-testid="favorites-pick-9"]`. Expect `fills["water|1"]` to be `9`.
3. Reopen `water-1`. Expect `[data-testid="favorites-clear"]` inside
   `favorites-pick-9`, and the sprite's opacity below 0.5.
4. Zoom with ctrl+wheel over the frame, or with CDP two-finger touch events on
   a touch context. Expect `data-zoom` above 1.
5. Scroll the frame to its far corner. Expect the last cell inside the frame
   and the header row's top equal to the frame's top.

## Gotchas

- Saved picks live under `favorite-picker` as
  `{state:{fills:{"<type>|<gen>":id}},version:3}`. An older seed, such as
  version 1, loads through `migrate`. Never clear it on a real user's browser.
  A grid-shape change must migrate it.
- `?packing=1` turns the packing sheet on outside production, for specs only.
  It is off on the live site.
- Only Gen 5-style pixel sprites appear. Forms without one are logged in
  `docs/favorite-picker-sprite-wishlist.md` and stay out of the selector.
- WebKitGTK's WebDriver scrolls only the page before a click. Scroll a cell into
  the grid frame first, or the click reports "element not interactable".
- A pinch on the page header or footer still zooms the whole page natively.
- Zoom resets on reload.
- Opening the page sends a `favorites-open` event. A browser that visited any
  page once with `?notme` flags it as the owner's.
