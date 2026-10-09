# League and trainer card export

Saves the league summary or one gym's trainer card as a PNG, with a live
preview and layout options.

## Sub-features

- Two entry buttons share one attribute: `[data-league-export="league"]` in the
  league pane's tool bar, and `[data-league-export="card"]` on an open card.
- The preview (`[data-export-preview] img`) sits beside a settings pane. At
  1024px and wider, the pane is `[data-export-overlay]`. On a phone, the pane
  is a bottom sheet with `data-export-chrome`, and `[data-export-overlay]` does
  not exist. The preview is a separate portal, `[data-export-preview-layer]`.
- League export only: four detail toggles (`[data-export-detail]`: league
  name, theme, TM reward, badge name) and a team mode
  (`[data-export-team="story"|"rematch"|"both"]`). A card export has neither.
- Card export only: a team-order setting
  (`[data-export-card-order="fixed"|"first-last"]`, with `aria-pressed`). Its
  preview frame key is `card:<i>:<order>`.
- Save (`[data-league-export-confirm]`) shares or downloads `my151-league.png`
  or `my151-trainer-card.png`. Both paint the team sprites at 1× (96 px) and
  wear a 12 px frame: red around the league, the bar's colour around the card.
- A survey can follow: `[data-export-survey-intro]`, then
  `[data-export-survey]` with an "other" option (`[data-export-other]`).

## How to get to it (user POV)

Open `/custom-gym-leader`. Tap the download icon in the league tool bar for the
whole league, or open a gym and tap the card's download icon. Set the options,
then tap save.

## Driving it with the harness

`gym-card-export` (`runGymCardExportParitySuite`) seeds a card, clicks
`[data-league-export="card"]`, and waits for `[data-export-preview] img`. It
asserts a complete image wider than 800px with zero `[data-export-detail]`
toggles (`gym-export:nimbus-preview`). It also checks the ace sprite's integer
scale, the TM chip inside its cell, and the solo-ace panel with no partner
(`gym-export:ace-integer-scale`, `tm-chip-inside-cell`, `solo-ace-panel`). It
never presses save.

`league-export-foil` (`runLeagueGymExportFoilSuite`) seeds a league, then opens
the league export and the first gym's trainer card export. Each preview must
load its foil maps and show the dex foil (`league-export:rainbow-foil`,
`gym-export:rainbow-foil`). The dex foil is the ink-only `color-dodge`
rainbow, with a tilt from 1.2 to 10.2 degrees. It never presses save.

`league-export-team` (`runLeagueExportTeamSuite`) presses each summary tab
(`[data-league-view="rematch"|"challenge"]`), opens
`[data-league-export="league"]`, and asserts that exactly one
`[data-export-team]` paints a background, and that it matches the tab
(`league-export:starts-at-rematch-tab`, `league-export:starts-at-challenge-tab`).

Manual drive (a Playwright script, local build):

1. Click `[data-league-export="league"]` and expect four
   `[data-export-detail]`.
2. Press each `[data-export-team]` and each toggle.
3. After each press, read the preview's `naturalWidth` and compare it with the
   base build.
4. To press save, stub `navigator.canShare` and catch the blob as in
   `view-and-export.md`.

## Gotchas

- A bare `[data-league-export]` matches the league pane's button first in the
  DOM. Always give the value.
- Never press save on a deployed site. On production it posts an export report
  to `/api/league` and an event to `/api/event`, and `?notme` does not stop the
  report. Preview deployments share the production database.
- `?demo=151` (and any Vercel preview) keeps the export report off the network.
  The flag works only off production. The survey still posts to
  `/api/feedback`, with no demo gate.
- The survey opens after every export on a Vercel preview, on a local build, or
  with `?notme`. In production it opens once, and only while the global export
  count is 1000 or less.
- The layout starts from URL flags (`exportTeamMode`, `exportLeagueName`, and
  others in `src/league/export/exportOptions.ts`). Without them it starts
  with every detail on, at Rematch when the Rematch tab is on screen and at
  Story otherwise.
