# League and trainer card export

Saves the league summary or one gym's trainer card as a PNG, with a live
preview and layout options.

## Sub-features

- Two entry buttons share one attribute: `[data-league-export="league"]` in the
  league pane's tool bar, and `[data-league-export="card"]` on an open card.
- An overlay (`[data-export-overlay]`) shows the preview
  (`[data-export-preview] img`) beside a settings pane.
- League export only: four detail toggles (`[data-export-detail]`: league
  name, theme, TM reward, badge name) and a team mode
  (`[data-export-team="story"|"rematch"|"both"]`). A card export has neither.
- Save (`[data-league-export-confirm]`) shares or downloads `my151-league.png`
  or `my151-trainer-card.png`.
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
toggles (`gym-export:nimbus-preview`). It never presses save, and no suite
opens the league export.

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
  The survey still posts to `/api/feedback`, with no demo gate.
- The survey opens after every export on a preview or with `?notme`. Elsewhere
  it opens at most once.
- The layout starts from URL flags (`exportTeamMode`, `exportLeagueName`, and
  others in `src/league/export/exportOptions.ts`). Without them it starts at
  Story with every detail on, whatever tab is on screen.
