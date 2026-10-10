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
use 32-bit floats. Poison's circles convert from rational quadratic curves to
quadratic Béziers with a 0.001-unit tolerance before the operations.
There is no raster tracing or polygon flattening.

The helper fails on unsupported source primitives or paint effects. Update the
source adapter deliberately if an upstream asset introduces them.
