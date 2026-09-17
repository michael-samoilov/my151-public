# View and export the finished dex

The shareable output: the finished dex rendered on one canvas, with sort and
display options, exportable as a PNG.

## Sub-features

- Render the dex on one page (`ViewPage`), grouped or flat.
- View settings: sort (build-order / regional / national / type / custom),
  section outlines, group-special-at-end, show-stats.
- Optional detailed-stats column drawn into the same export canvas.
- Export as a PNG (`my151.png`) via the shared preview overlay: live settings
  pane, 3D tiltable preview card, then share or download.
- Post-export survey (`You're here early!` → feedback / where they heard of us).

## How to get to it (user POV)

Tap the view tab (`[data-nav="view"]`). The finished dex appears. A settings
control (`aria-label="View settings"`, hardcoded English) opens the view
options. The export control (`[data-dex-export]`) opens the preview overlay.

## Driving it with the harness

Seed a dex, click `[data-nav="view"]`, and assert the view activates (its nav
button's computed background is non-transparent) and the canvas renders. Click
`[data-dex-export]` and assert `[data-export-preview-layer]` and
`[data-dex-export-confirm]` appear before any download. Settings writes update
the preview blob URL. Save then asserts `[data-export-survey-intro]`. The PNG
blob itself is still produced on Save (`navigator.share` or
`<a download="my151.png">`); the repo's own e2e checks a >50KB blob in
`e2e/dev/poster-export.spec.ts`.

## Gotchas

- Sort and display toggles persist in the store (`viewSortOption`,
  `viewGroupSpecialAtEnd`, `viewCustomOrder`, `viewShowSections`); seed them if a
  specific view state is under test.
- Export settings ride along in the completion/export beacon, which is suppressed
  locally, so verify the blob, not a network call.
- The view tab needs a non-empty dex to render anything meaningful; seed first.
