# Selected type icons

`selections.json` records Michael's October 9, 2026 choices. Partywhale supplies Fighting, Rock, Bug, Water, and Psychic. Elginive supplies the other 13 types.

Bug preserves Partywhale's right half and mirrors it onto the left. Water and Psychic also mirror their right halves. The mirror axis is x = 128 in the original 256 × 256 SVGs. Internal coloured shapes become transparent cutouts.

The shared generated registry is `src/data/type-icons.ts`. Existing consumers use `typeIconPath` for padded coloured squares and `typeGlyphPath` for transparent white glyphs. The same glyph URLs serve CSS masks and canvas exports. No runtime PNG thresholding remains.

Run from the repository root with installed dependencies and a Playwright Chromium executable:

```bash
flock /tmp/my151-browser.lock node scripts/build-selected-type-icons.mjs
```

Set `PLAYWRIGHT_CHROMIUM_PATH` if Chromium is installed outside Playwright's default directory. The generator uses Python's standard XML parser, then measures SVG path bounds in Chromium. It commits explicit glyph dimensions, containment, symmetry, and content-hashed filenames. Changed filenames avoid stale service-worker and immutable sprite caches.

The square icon retains the app palette and contains a 40 × 40 glyph box inside a 60 × 60 square. Its 10 px inset prevents tall glyphs from escaping. Transparent glyphs preserve their tight aspect ratio for existing badge and outline sizing.

## Asset licenses

The included source SVGs come from these pinned repositories:

- Partywhale: https://github.com/partywhale/pokemon-type-icons/tree/fcbe6978c61c359680bc07636c3f9bdc0f346b43. MIT. Preserve `sources/partywhale/LICENSE`. The distributed notice is `public/licenses/partywhale-pokemon-type-icons-MIT.txt`.
- Elginive: https://github.com/Elginive/pokemon-type-icons/tree/b8562e080dd0b48742a9ba0c9b0bc7f1acdc5d88. Its README grants free use and says credit is appreciated but not necessary. The original README is included under `sources/elginive`.

The third-party terms apply to those assets and our modified copies. They do not relicense this repository.
