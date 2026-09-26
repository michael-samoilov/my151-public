# View and export the finished dex

The shareable output: the finished dex laid out on one page, with sort and
display options, exportable as a PNG.

## Sub-features

- The view (`ViewPage`) renders the dex as DOM tiles (`[data-view-tile="<id>"]`),
  grouped or flat. Only the export draws a canvas.
- View settings: sort (build order, regional, national, type, custom), section
  outlines, group-special-at-end, and show-stats.
- A detailed-stats column in the export, available from 100 placed.
- Export as a PNG (`my151.png`) through the share sheet or a download.

## How to get to it (user POV)

Tap the view tab (`[data-nav="view"]`). The settings control carries
`aria-label="View settings"` (hard-coded English). The export control is the
next button, `[aria-label="View settings"] + button`, with no handle of its
own. It is unavailable while an export runs and when the dex is empty.

## Driving it with the harness

The standard suite covers the view tab: it activates (computed background), the
header lanes hold, and the render audit is clean. Nothing in the harness clicks
export. The repo's `e2e/dev/poster-export.spec.ts` calls `generateExportImage`
directly through dev imports and never clicks the control either.

Manual drive (a Playwright script, local build): seed 37 with
`viewSortOption: 'national'`, open the view tab, and expect 37
`[data-view-tile]` with 46 first. Stub `navigator.canShare` to `undefined`,
wrap `URL.createObjectURL` and the anchor click to catch the blob, and abort
`/api/submit`. Click export and assert an `image/png` blob over 50 KB named
`my151.png`.

## Gotchas

- Never click export on a deployed site. Export posts a report to `/api/submit`
  (`keepalive`) that only demo mode holds back, not `?notme`. The survey that
  can follow posts to `/api/feedback`, and previews share the production
  database.
- The share sheet runs only off Android and only when
  `navigator.canShare({files})` is true. Android always downloads through
  `<a download>` (`src/lib/exportImage.ts`).
- Section outlines draw only with the build-order sort.
- On a phone the settings sheet stages changes until its apply button. Desktop
  applies them live.
- `viewSortOption`, `viewGroupSpecialAtEnd`, `viewCustomOrder`, and
  `viewShowSections` persist in the store. `viewShowStats` does not.
- The export survey opens after every export on a Vercel preview or with
  `?notme`.
