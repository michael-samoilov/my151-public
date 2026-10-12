// Round 2 candidates. `size` is how the icon sits on the tile:
//   hammer - the hammer's box (35 of 166 card units), 2-unit stroke
//   large  - the same box drawn with pathScale(LARGE): the drawing grows 1.35x,
//            the stroke stays the hammer's on-screen width (2 / 1.35 units)
import { CRACK_HAMMER, CRACK_LARGE } from './icons.mjs';

// The large crack without the run to the outline (C), with A up to its down-left turn.
const { C: _C, ...LARGE_NO_C } = CRACK_LARGE;
const LEFT_TURN = { ...LARGE_NO_C, A: CRACK_LARGE.A.slice(0, 4) };

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
  // Michael's final egg: option 4 plus option 3's left run, as far as its
  // down-left turn. The run ends where the left spot sat, so that spot moves
  // 3.75 sprite px left and 2.75 down: the least move that keeps every gap.
  { id: 'large-spots-turn', name: 'Crack, left turn and spots, larger', size: 'large', opts: { crack: LEFT_TURN, spots: SPOTS3, move: { s1: [-3.75, 2.75] }, ...big } },
  { id: 'large-togepi', name: 'Togepi egg, larger', size: 'large', opts: { crack: CRACK_LARGE, tris: togepi(5.6, 16.0, 7.8), ...big } },
];
