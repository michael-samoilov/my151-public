# View and export the finished dex

The shareable output: the finished dex laid out on one page, with sort and
display options, exportable as a PNG.

## Sub-features

- The view (`ViewPage`) renders the dex as DOM tiles (`[data-view-tile="<id>"]`),
  grouped or flat. Only the export draws a canvas.
- View settings: sort (build order, regional, national, type, custom), section
  outlines, and group-special-at-end. Detailed stats are export-only.
- A detailed-stats column in the export, available from 100 placed.
- Export opens a preview overlay first: a live settings pane (sort, outlines,
  group special at end, stats) beside a 3D preview card, then save. The
  group-special toggle is `[data-export-group-special]`. The foil has no
  controls in the pane; it always uses the defaults below. Export settings do
  not write the View store.
- Save produces `my151.png` through the share sheet or a download. The PNG has
  rounded transparent corners (radius 4% of the short edge), and the red frame
  follows the curve. The sprites paint at 1× (96 px) and the frame is 12 px,
  the same as on both league exports (`EXPORT_SPRITE_PX`, `EXPORT_FRAME_PX`).
- The preview card auto-tilts on open (not with reduced motion). On desktop,
  the first hover takes manual control and ends auto-tilt: leaving rests the
  card flat, and each later hover tilts it again. A click locks it flat and
  ignores hover until the next click, which resumes hover tilt. On touch, a
  tap toggles auto-tilt, and a drag follows the finger, then settles flat.
- The holo pair is the gleam and the prism bands (October 12), in
  `src/league/components/foil/my151Holo.css`. The gleam is two sets of soft
  diagonal bands that slide against each other as the card tilts, under a
  top-to-bottom pastel rainbow and grain, blended with `color-dodge` and
  masked to the ink; their crossings swell into bright knots. The prism is
  fine pastel bands with `soft-light`. The iridescence blends with
  `soft-light`, and the glare is
  fixed `overlay` with no dark far stop. The export pane has no blend
  selector.
- The camera sits `PREVIEW_PERSPECTIVE_RATIO` (1.75) times the card's long
  edge away (`src/components/export/exportPreviewFit.ts`), so a big desktop
  card leans as little as a phone card. The card's size still comes from a
  fit for the fixed 600 px camera the preview had before October 10
  (`previewSizeCamera`), so a desktop card stays that size.
- The drop shadow is the PNG's own shape, blurred: two
  `[data-export-shadow-layer]` elements in the lift, moved by transform. It
  follows the concave kinks between joined panes, which a box-shadow left
  as light wedges. The lift has no box-shadow.
- `/foil-workshop` (off in production) drives the same `ExportPreview3D` card
  with Shine (the gleam), Rainbow (the prism), Point light, Iridescence, Max tilt, Glare
  (intensity and size), and Shadow controls. Max tilt sets the hover tilt, the
  auto-tilt, and the cap together. It restores only those dials from its saved
  recipe or link; everything else, the 1.15 pop included, is the in-app
  default. Compare buttons switch between the live site's look and the
  proposal under review. Dials kept in the link only set the camera distance
  (or a fixed 600 px), the iridescence blend (`soft-light` or `hue`), the
  glare's dark edge, and the card size (a multiple of the pre-October-10
  size, or as big as the tilt allows). Samples: Dex, Dex of all 151, Dex of
  151 with stats, league, league filled, league with story and rematch
  teams, trainer card, favorites chart, a test card of color swatches, and
  three flat gray cards (wide, league-shaped and tall) that show the bands
  with nothing in the way.
- Defaults (Michael's workshop pick, September 27; the holo pair from
  October 12): gleam 0.65, prism 0.21,
  point light 1, iridescence 0.1, max and auto tilt 10 degrees, tilt factor
  10/7, glare 0.6 at size 0.5 (1 until October 11), shadow blur 25, exit
  delay 420 ms, pop 1.15.
- A survey can follow a save. Its highlight sprite is integer-scaled at 1× or
  more.

## How to get to it (user POV)

Tap the view tab (`[data-nav="view"]`). The settings control carries
`aria-label="View settings"` (hard-coded English). The export control is
`[data-dex-export]`, the next button. It is unavailable only when the dex is
empty. It opens the overlay, and `[data-dex-export-confirm]` saves. The confirm
button is unavailable while an export runs.

## Driving it with the harness

The standard suite covers the view tab: it activates (`aria-selected`, with the
computed background as a fallback), the header lanes hold, and the render audit
is clean.

`runDexExportSuite` clicks `[data-dex-export]` and asserts
`[data-export-preview-layer]` and `[data-dex-export-confirm]` before any
download. After the preview paints, it checks:

- `dex-export:rainbow-on-open`: the gleam layer is `color-dodge`, visible,
  masked to the ink, and carries at least two sets of repeating bands.
  It polls up to 1.5 seconds, because WebKitGTK here paints near 7 fps.
- `dex-export:auto-tilt` and `idle-circular`: with a stationary cursor on the
  card, `data-export-orbit=idle`, the tilt changes, and the painted box moves
  and stays inside the preview layer and the viewport.
- `dex-export:hover-no-scale`: hover lifts the card with a stable
  `offsetWidth` (no bounce-zoom).
- `dex-export:hover-leave-static`: after a hover, leaving settles
  `data-export-orbit=static` flat, and it is still static 1.5 seconds later.
- `dex-export:lock-on-press`: a press sets `data-paused=1` and settles flat.
- `dex-export:no-corner-mask`: the card background is transparent, there is no
  separate rounded `clip-path`, and the card's mask is the active PNG.
- `dex-export:survey-sprite-scale`: the survey sprite is an integer multiple of
  the native size.

It also runs these checks:

- `dex-export:card-in-view` and `card-fill`: the card stays inside the preview
  layer and the viewport, and covers at least 70% of the layer.
- `dex-export:outlines-row`: the pane has `[data-export-outlines]`.
- `dex-export:tilt-magnitude`: the hover tilt peaks above 2 degrees and at
  most 10.2 degrees.
- `dex-export:dynamic-shadow`: the shadow moves to the pointer's side, and only
  the lift's two shape-shadow layers paint it.
- `dex-export:tilt-corner-margin`: the tilted card keeps 16 px or more from the
  layer and viewport edges.
- `dex-export:tilt-on-painted`: a pointer on the painted card, outside its rest
  box, tilts it.
- `dex-export:shine`, `rainbow-foil`, and `shine-clip`: the foil and holo
  layers show. After a hover, the holo stays `color-dodge` and ink-masked. The
  card clips every foil layer.

Before the survey check, the suite stubs `navigator.canShare` to return
`false` and presses `[data-dex-export-confirm]`. On the local preview builds
that the harness uses, `/api/submit` has no handler, so nothing is recorded.

`runFoilWorkshopSuite` opens `/foil-workshop` and asserts the keeper
controls (Shine, Rainbow, Point light, Iridescence, Max tilt, Glare, Shadow),
no blend, mask, sparkle, or parallax controls,
`--foil-gleam` at `0.65`, and a working glare slider.

Manual drive (a Playwright script, local build): seed 37 with
`viewSortOption: 'national'`, open the view tab, and expect 37
`[data-view-tile]` with 46 first. Stub `navigator.canShare` to `undefined`,
catch the download, and abort `/api/submit`. Click `[data-dex-export]`, then
`[data-dex-export-confirm]`, and assert an `image/png` over 50 KB named
`my151.png` with alpha 0 at each corner.

## Gotchas

- Never press save on a deployed site. Save posts a report to `/api/submit`
  (`keepalive`), and the survey that can follow posts to `/api/feedback`.
  Previews share the production database. On a Vercel preview host, both
  routes answer 200 and store nothing (`isReadOnlyDeployment` in
  `api/_shared.ts`), and `?notme` holds back the report on any host. Local
  `vite preview` has no API at all.
- The share sheet runs only on iPhone and iPad, and only when
  `navigator.canShare({files})` is true. Every other platform, desktop
  included, downloads through `<a download>` (`src/lib/shareOrDownload.ts`).
- Section outlines draw only with the build-order sort.
- On a phone the View settings sheet stages changes until its apply button.
  Desktop applies them live.
- `viewSortOption`, `viewGroupSpecialAtEnd`, `viewCustomOrder`, and
  `viewShowSections` persist in the store. `viewShowStats` does not.
- The export survey opens after every export on a Vercel preview or with
  `?notme`.
- WebKit rejects port 4190, a browser "bad port". Serve a local build on
  another port.
