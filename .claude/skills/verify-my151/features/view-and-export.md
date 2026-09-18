# View and export the finished dex

The shareable output: the finished dex rendered on one canvas, with sort and
display options, exportable as a PNG.

## Sub-features

- Render the dex on one page (`ViewPage`), grouped or flat.
- View settings: sort (build-order / regional / national / type / custom),
  section outlines, group-special-at-end. Detailed stats are export-only.
- Optional detailed-stats column drawn into the export canvas, not the View page.
- Export as a PNG (`my151.png`) via the shared preview overlay: live settings
  pane, 3D tiltable preview card, then share or download. Export settings do
  not write the View store.
- Desktop auto-tilt (idle orbit) parks on press and resumes on a second press.
  Foil shine is visible while the card is tilted. Rest size fills the pane.
  Hover tilt matches poke-holo / hover-tilt: CSS `--rotate-x` / `--rotate-y`
  from the untransformed hit box, `rotateY(var(--rotate-x)) rotateX(var(--rotate-y))`,
  no scale. Perspective `600px` and `preserve-3d` sit on the hit parent
  (poke-holo `.card__translater`). Idle is the 25° showcase orbit and must
  keep running with a stationary cursor on the card. A first mouse move is
  not required. The painted `getBoundingClientRect` must change. Data
  attributes alone are not enough.
- Post-export survey (`You're here early!` → feedback / where they heard of us).
  The highlight sprite is integer-scaled at ≥ 1× native (`usePixelPerfectSprite`).

## How to get to it (user POV)

Tap the view tab (`[data-nav="view"]`). The finished dex appears. A settings
control (`aria-label="View settings"`, hardcoded English) opens the view
options. The export control (`[data-dex-export]`) opens the preview overlay.

## Driving it with the harness

Seed a dex, click `[data-nav="view"]`, and assert the view activates (its nav
button's computed background is non-transparent) and the canvas renders. Click
`[data-dex-export]` and assert `[data-export-preview-layer]` and
`[data-dex-export-confirm]` appear before any download. Settings writes update
the preview blob URL. Save then asserts `[data-export-survey-intro]`. After the
preview image paints, the harness leaves the Playwright pointer frozen,
dispatches a stationary `pointermove` at the card center (a sitting cursor),
and samples tilt twice (≥800ms apart). Auto-tilt passes only when
`data-export-orbit=idle`, the tilt values change, the hit parent has
`perspective: 600px` plus `preserve-3d`, and the card's transformed
`getBoundingClientRect` moves by more than 8px. Data attributes without a
moving box fail. It then circles the pointer on the hit box and asserts
`data-tilt-scale=1` with a stable `offsetWidth` (no bounce-zoom). Lock on press
(`data-paused=1`), desktop rest fill (long-axis cover ≥ 82% of the preview
layer), and the survey sprite’s device-pixel size (`[data-export-survey-sprite]`,
≥ 1× native, integer scale) still apply.
The PNG blob itself is still produced on Save (`navigator.share`
or `<a download="my151.png">`); the repo's own e2e checks a >50KB blob in
`e2e/dev/poster-export.spec.ts`.

## Gotchas

- Sort and display toggles persist in the store (`viewSortOption`,
  `viewGroupSpecialAtEnd`, `viewCustomOrder`, `viewShowSections`); seed them if a
  specific view state is under test.
- Export settings ride along in the completion/export beacon, which is suppressed
  locally, so verify the blob, not a network call.
- The view tab needs a non-empty dex to render anything meaningful; seed first.
