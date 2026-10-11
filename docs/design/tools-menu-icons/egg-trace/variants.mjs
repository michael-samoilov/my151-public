// Round 2 candidates. `size` is how the icon sits on the tile:
//   hammer - the hammer's box (35 of 166 card units), 2-unit stroke
//   large  - the same box drawn with pathScale(LARGE): the drawing grows 1.35x,
//            the stroke stays the hammer's on-screen width (2 / 1.35 units)
import { CRACK_HAMMER, CRACK_LARGE } from './icons.mjs';

export const LARGE = 1.35;
const big = { stroke: 2 / LARGE, gap: 2 / LARGE };
const ALL = ['s1', 's2', 's3', 's4'];

// Spot 2 (the small centre spot) sits 1-2 px from spot 3 on the sprite; at
// either size their strokes would touch, so the spot versions draw 1, 3 and 4.
const SPOTS3 = ['s1', 's3', 's4'];

// Togepi: Togepi's sprite shows a blue triangle pointing up in front and a red
// one pointing down wrapping round the left edge. Mirror-symmetric here: the
// up triangle on the axis, a down triangle wrapping each side.
const togepi = (L, cy, off) => [
  { c: [12, cy], L, up: true },
  { c: [12 + off, cy - 0.6], L, up: false, wrap: true },
  { c: [12 - off, cy - 0.6], L, up: false, wrap: true },
];

export const CANDIDATES = [
  { id: 'crack', name: 'In-game crack', size: 'hammer', opts: { crack: CRACK_HAMMER } },
  { id: 'spots', name: 'In-game crack and spots', size: 'hammer', opts: { crack: CRACK_HAMMER, spots: SPOTS3 } },
  { id: 'large-crack', name: 'Full in-game crack, larger', size: 'large', opts: { crack: CRACK_LARGE, ...big } },
  { id: 'large-spots', name: 'Full crack and spots, larger', size: 'large', opts: { crack: CRACK_LARGE, spots: SPOTS3, ...big } },
  { id: 'large-chip', name: 'Chipped crown, larger', size: 'large', opts: { crack: CRACK_LARGE, chip: true, ...big } },
  { id: 'large-togepi', name: 'Togepi egg, larger', size: 'large', opts: { crack: CRACK_LARGE, tris: togepi(5.6, 16.0, 7.8), ...big } },
];
