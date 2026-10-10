# Build selected type geometry

The committed SVG assets require no runtime geometry library. Python tools run
only when the selected artwork changes.

Install the pinned build tools in a separate environment:

```bash
python -m venv /tmp/my151-type-icons-env
/tmp/my151-type-icons-env/bin/pip install -r scripts/type-icons/requirements.txt
/tmp/my151-type-icons-env/bin/python scripts/type-icons/compound.py > /tmp/my151-type-paths.json
```

`compound.py` reads the candidates from `prepare.py`. Each output candidate
contains one white compound path, its final bounds, and the original bounds.
`sourceBody` retains the prepared source group so the generator can preserve
its original viewport and inset geometry.
The existing source selection and license notices remain the generator's inputs.

White source shapes add coverage. Black source shapes subtract coverage in paint
order. Intrinsic path holes retain their source fill rule. The helper applies
source transforms before it computes the result.

For Bug, Water, and Psychic, the helper intersects the chosen artwork with the
right half-plane at `x = 128`. It reflects that geometry through `x = 128`, then
unites both halves. The resulting path has no clipping boundary or overlapping
center edge. The output contains no mask, clip path, or SVG reference.

Skia retains lines and Bézier curves during Boolean operations. Its coordinates
use 32-bit floats. Poison's circles use eight cubic Bézier arcs, with less than
0.001 source-unit error at the selected source sizes. This avoids a conic control
point defect in the pinned Python wrapper.
There is no raster tracing or polygon flattening.

The helper fails on unsupported source primitives or paint effects. Update the
source adapter deliberately if an upstream asset introduces them.

## Preserve game proportions

`game-calibration.json` pins the 18 original Gen IX Scarlet/Violet PNGs from
PokeAPI by URL and SHA-256 digest. Their cached bytes match the upstream files.
The measurements use each background color to recover white coverage, then
measure the 50% coverage contour.

The SVG generator scales each selected vector uniformly to the corresponding
game symbol's maximum extent. It preserves the game symbol's bounds center.
Bug, Water, and Psychic retain horizontal symmetry around game coordinate 30.

All transparent glyphs share a 44-unit square frame, corresponding to game
coordinates 8-52. The colored icon places that same content at `(8, 8)` inside
the 60-unit square. This includes Grass's lower edge at game coordinate 51.
It also preserves relative sizes in existing badge, CSS mask, and canvas slots.

The generator checks the pinned source hashes and rejects artwork outside the
shared frame. If an upstream reference changes, measure it again before
updating the calibration. Changing each SVG to its tight bounds would erase
the game proportions and optical placement.
