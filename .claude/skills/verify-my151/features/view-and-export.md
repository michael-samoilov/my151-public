# View and export the finished dex

The shareable output: the finished dex laid out on one page, with sort and
display options, exportable as a PNG.

## Sub-features

- The view (`ViewPage`) renders the dex as DOM tiles (`[data-view-tile="<id>"]`),
  grouped or flat. Only the export draws a canvas.
- View settings: sort (build order, regional, national, type, custom), section
  outlines, and group-special-at-end. Detailed stats are export-only.
- A detailed-stats column in the export, available from 100 placed.
- Export opens a preview overlay first: a live settings pane (Shine, Glare,
  Shadow, sort, outlines, stats) beside a 3D preview card, then save. Export
  settings do not write the View store.
- Save produces `my151.png` through the share sheet or a download. The PNG has
  rounded transparent corners (radius 4% of the short edge), and the red frame
  follows the curve. The sprites paint at 1× (96 px) and the frame is 12 px,
  the same as on both league exports (`EXPORT_SPRITE_PX`, `EXPORT_FRAME_PX`).
- The preview card auto-tilts on open (not with reduced motion). On desktop,
  the first hover takes manual control and ends auto-tilt: leaving rests the
  card flat, and each later hover tilts it again. A click locks it flat and
  ignores hover until the next click, which resumes hover tilt. On touch, a
  tap toggles auto-tilt, and a drag follows the finger, then settles flat.
- The holo layer is the poke-holo "V" shine: a sunpillar rainbow, diagonal
  bands, and faint noise, blended with `color-dodge` and masked to the ink.
  A second copy (`::after`, `soft-light`) moves its bands the opposite way.
  The glare is fixed `overlay`. There is no blend selector.
- `/foil-workshop` (off in production) drives the same `ExportPreview3D` card
  with Shine (the V shine), Rainbow, Point light, Iridescence, Max tilt, Glare
  (intensity and size), and Shadow controls. Max tilt sets the hover tilt, the
  auto-tilt, and the cap together. It restores only those dials from its saved
  recipe or link; everything else, the 1.15 pop included, is the in-app
  default. Samples: Dex, Dex of all 151, Dex of 151 with stats, league,
  league filled, league with story and rematch teams, trainer card, and a
  test card of color swatches.
- Defaults (Michael's workshop pick, September 27): shine 0.7, rainbow 0.2,
  point light 1, iridescence 0.1, max and auto tilt 10 degrees, tilt factor
  10/7, glare 1 at size 0.5, shadow blur 25, exit delay 420 ms, pop 1.15.
- A survey can follow a save. Its highlight sprite is integer-scaled at 1× or
  more.

## How to get to it (user POV)

Tap the view tab (`[data-nav="view"]`). The settings control carries
`aria-label="View settings"` (hard-coded English). The export control is
`[data-dex-export]`, the next button. It is unavailable while an export runs
and when the dex is empty. It opens the overlay; `[data-dex-export-confirm]`
saves.

## Driving it with the harness

The standard suite covers the view tab: it activates (computed background), the
header lanes hold, and the render audit is clean.

`runDexExportSuite` clicks `[data-dex-export]` and asserts
`[data-export-preview-layer]` and `[data-dex-export-confirm]` before any
download. After the preview paints, it checks:

- `dex-export:rainbow-on-open`: the holo layer is `color-dodge`, visible,
  masked to the ink, and carries the V bands and the crossing `::after` layer.
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

`runFoilWorkshopSuite` opens `/foil-workshop` and asserts the keeper
controls (Shine, Rainbow, Point light, Iridescence, Max tilt, Glare, Shadow),
no blend, mask, sparkle, or parallax controls,
`--foil-holographic` at `0.7`, and a working glare slider.

Manual drive (a Playwright script, local build): seed 37 with
`viewSortOption: 'national'`, open the view tab, and expect 37
`[data-view-tile]` with 46 first. Stub `navigator.canShare` to `undefined`,
catch the download, and abort `/api/submit`. Click `[data-dex-export]`, then
`[data-dex-export-confirm]`, and assert an `image/png` over 50 KB named
`my151.png` with alpha 0 at each corner.

## Gotchas

- Never press save on a deployed site. Save posts a report to `/api/submit`
  (`keepalive`) that only demo mode holds back, not `?notme`. The survey that
  can follow posts to `/api/feedback`, and previews share the production
  database.
- The share sheet runs only off Android and only when
  `navigator.canShare({files})` is true. Android always downloads through
  `<a download>` (`src/lib/exportImage.ts`).
- Section outlines draw only with the build-order sort.
- On a phone the View settings sheet stages changes until its apply button.
  Desktop applies them live.
- `viewSortOption`, `viewGroupSpecialAtEnd`, `viewCustomOrder`, and
  `viewShowSections` persist in the store. `viewShowStats` does not.
- The export survey opens after every export on a Vercel preview or with
  `?notme`.
- WebKit rejects port 4190, a browser "bad port". Serve a local build on
  another port.
