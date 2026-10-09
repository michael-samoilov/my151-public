/**
 * Measures where the Picker minimap should rest, and checks the rule in
 * `FavoritesGrid.tsx` against that measurement. A manual tool: rerun it when
 * the minimap size, the zoom range, or the locked corner cells change.
 *
 *   npx tsx --tsconfig tsconfig.app.json scripts/favorite-minimap-spot.ts
 *
 * The grid is scrolled to its bottom-right corner. For each right offset of
 * the minimap, it finds the worst coverage of any pickable cell over every
 * zoom, on an empty grid and on a filled grid (sprites in the last row and
 * column make a filled grid scroll 4 px further). The best offset has the
 * lowest worst case. The minimap sits on the bottom edge, which is best at
 * every cell size.
 */
import { GEN_AXIS, TYPE_AXIS } from '../src/favorites/model/cells';
import { kindFor } from '../src/favorites/model/eligibility';

// Outer minimap boxes: the 100 and 180 px maps plus 3 px padding on each side.
const PLATFORMS = [
  { name: 'phone', width: 106, height: 61, maxZoom: 4, cells: [38, 42, 44, 46, 50, 54, 58, 64, 70, 80] },
  { name: 'desktop', width: 186, height: 104, maxZoom: 2.5, cells: [96] },
];
const FILLED_OVERFLOW = [0, 4];
// The rule in FavoritesGrid.tsx: right offset = 2.57 × cell − 0.67 × minimap width.
const rule = (cell: number, width: number) => Math.max(0, Math.round(2.57 * cell - 0.67 * width));

// Pickable cells near the corner, as (column, row) counted from the bottom-right.
const pickable: Array<[number, number]> = [];
for (let column = 0; column < 7; column++) {
  for (let row = 0; row < 6; row++) {
    const kind = kindFor(TYPE_AXIS[TYPE_AXIS.length - 1 - column], GEN_AXIS[GEN_AXIS.length - 1 - row]);
    if (kind !== 'disabled' && kind !== 'null') pickable.push([column, row]);
  }
}

function worstCoverage(right: number, width: number, height: number, cell: number, maxZoom: number): number {
  let worst = 0;
  for (const overflow of FILLED_OVERFLOW) {
    for (let zoom = 1; zoom <= maxZoom + 1e-9; zoom += 0.02) {
      const size = cell * zoom;
      for (const [column, row] of pickable) {
        const x = overflow + column * size;
        const y = overflow + row * size;
        const w = Math.max(0, Math.min(x + size, right + width) - Math.max(x, right));
        const h = Math.max(0, Math.min(y + size, height) - y);
        worst = Math.max(worst, (w * h) / (size * size));
      }
    }
  }
  return worst;
}

let failed = false;
for (const { name, width, height, maxZoom, cells } of PLATFORMS) {
  for (const cell of cells) {
    let best = { right: 0, worst: Infinity };
    for (let right = 0; right <= 3 * cell; right++) {
      const worst = worstCoverage(right, width, height, cell, maxZoom);
      if (worst < best.worst - 1e-9) best = { right, worst };
    }
    const right = rule(cell, width);
    const worst = worstCoverage(right, width, height, cell, maxZoom);
    const off = worst - best.worst > 0.01;
    failed ||= off;
    console.log(`${name} cell ${cell} px: best right ${best.right} px, worst ${(best.worst * 100).toFixed(1)}% | rule ${right} px, worst ${(worst * 100).toFixed(1)}%${off ? '  <- more than 1 point off' : ''}`);
  }
}
if (failed) process.exit(1);
