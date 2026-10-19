# Mobile homepage artwork

`manifest.mjs` validates the generated files in `src/assets/home/mobile`.
Normal builds call `copyHomeArtwork(root, outDir)` to validate inputs and copy
hashed images to `/assets/home-mobile/`. `presentationManifest(root)` returns
only the pose data needed by the browser. Type declarations accompany this API.

Freshness inputs include renderer/controller source, layout CSS, viewport helpers,
original screenshot bytes, consumed font bytes, and pipeline scripts. The lockfile
hash and browser/Pillow versions are provenance only. A lockfile rewrite does not
invalidate pixels. Source CSS hashes do not detect changes in generated CSS caused
only by compiler upgrades; those upgrades require regeneration and visual review.

Run regeneration after the production renderer and its adapter changes are final:

```
node scripts/home-artwork/refresh.mjs
```

The command takes the shared browser lock. It builds the actual application in an
isolated output directory with `MY151_HOME_ARTWORK_CAPTURE=1`. The application and
prerender plugin must use that build-only flag to select original screenshots and
bypass stale-asset validation. Ordinary browser URLs must not enable capture mode.
The capture build must still contain the full homepage, actual artwork, and fonts.

The command captures nine phone widths at DPR 3, trims transparent alpha, and
encodes each of three cards as AVIF quality 95, speed 6, 4:4:4 and lossless WebP.
It publishes only after all 27 cases pass. It then runs a normal guarded build.
Failure restores prior assets and removes the failed normal build output.

Regeneration needs project dependencies, system Chromium, `flock`, Python, and
Pillow with AVIF/WebP support. `CHROMIUM_PATH` selects an alternative Chromium.
Deployment and ordinary builds need none of the capture prerequisites.

Operational evidence lives under the worktree's Git directory in
`home-artwork-runs/<timestamp>/`. Refresh status records lock wait, stages, failures,
and rollback. Raw screenshots and per-case receipts stay there. The committed
manifest contains generation provenance and validated asset geometry and hashes.

A successful refresh is not an optical or performance verdict. Compare actual
phone and desktop rendering, resize behavior, resource selection, decode failures,
and public Google reports before release. Keep captions and links as HTML.
