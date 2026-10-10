# Selected type icons

`selections.json` records Michael's October 9, 2026 choices. Partywhale supplies Fighting, Rock, Bug, Water, and Psychic. Elginive supplies the other 13 types.

Bug preserves Partywhale's right half and mirrors it onto the left. Water and Psychic also mirror their right halves. The mirror axis is x = 128 in the original 256 × 256 SVGs. Internal coloured shapes become transparent cutouts.

The shared generated registry is `src/data/type-icons.ts`. Existing consumers use `typeIconPath` for padded coloured squares and `typeGlyphPath` for transparent white glyphs. The same glyph URLs serve CSS masks and canvas exports. No runtime PNG thresholding remains.

Install the pinned Python geometry tools as described in `BUILD.md`. Run from the
repository root with installed app dependencies and a Playwright Chromium executable:

```bash
TYPE_ICON_PYTHON=/tmp/my151-type-icons-env/bin/python \
  flock /tmp/my151-browser.lock node scripts/build-selected-type-icons.mjs
```

Set `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is installed outside Playwright's default directory. The generator converts source paint into filled compound paths at build time, then measures the original SVG bounds in Chromium. It commits explicit glyph dimensions, containment, symmetry, and content-hashed filenames. Changed filenames avoid stale service-worker and immutable sprite caches. Keep previous files so open tabs retain their asset URLs.

Generated artwork contains no internal masks, clip paths, or nested SVGs.
The 15 unmirrored types retain their original white paths and circles. Vector
Boolean operations turn colored cutouts into holes and unite the three mirrored
types. This removes mask rasterization and independently antialiased center edges.

`game-calibration.json` records measurements and hashes of the original 60 × 60
Scarlet/Violet icons in `public/sprites/types/small`. Each selected SVG gets one
uniform scale that matches its game symbol's maximum extent. The game symbol's
optical center determines placement. Bug, Water, and Psychic retain the common
vertical symmetry axis. Selected shapes keep their original aspect ratios.

Every transparent glyph uses the same 44 × 44 frame, corresponding to game
coordinates 8-52. Its padding carries relative game sizes into existing badges,
CSS masks, and exports. The colored square embeds this frame at 8,8 inside the
original 60 × 60 square and retains the app palette. This includes Grass's
41-unit extent without clipping. The generator rejects artwork outside the frame.

## Asset licenses

The included source SVGs come from these pinned repositories:

- Partywhale: https://github.com/partywhale/pokemon-type-icons/tree/fcbe6978c61c359680bc07636c3f9bdc0f346b43. MIT. Preserve `sources/partywhale/LICENSE`. The distributed notice is `public/licenses/partywhale-pokemon-type-icons-MIT.txt`.
- Elginive: https://github.com/Elginive/pokemon-type-icons/tree/b8562e080dd0b48742a9ba0c9b0bc7f1acdc5d88. Its README grants free use and says credit is appreciated but not necessary. The original README is included under `sources/elginive`.

The third-party terms apply to those assets and our modified copies. They do not relicense this repository.
