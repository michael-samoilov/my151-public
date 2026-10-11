// Draws an original MissingNo.-style glitch block: a backwards "L" (┘) on a
// 7x7 grid of 8x8 tiles, filled with 2-bit "wrong data" decoded in vertical
// 2-pixel columns, the order Gen 1 sprite data is laid out in.
export const N = 56, TILE = 8;
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// ┘: empty where col<4 && row<4 (in tiles). Bar and foot are both 3 tiles thick.
export const inShape = (x, y) => !(x < 4 * TILE && y < 4 * TILE);
export let DARK = 0.45;
export const setDark = (d) => { DARK = d; };
export function generate(seed) {
  const r = mulberry32(seed);
  const px = Array.from({ length: N }, () => new Array(N).fill(-1));
  // Byte pool: what a ROM bank looks like when read as tiles.
  const pool = [0x00, 0xff, 0xaa, 0x55, 0xf0, 0x0f, 0xcc, 0x33, 0x81, 0x7e, 0x18, 0xe7, 0xc3, 0x3c];
  // Fill tile by tile, but tiles in the same column share a "stream" so data
  // runs vertically, like a sprite decoded in the wrong order.
  for (let tx = 0; tx < 7; tx++) {
    let lo = 0, hi = 0, hold = 0;
    for (let ty = 0; ty < 7; ty++) {
      const mode = r();
      for (let row = 0; row < 8; row++) {
        if (hold-- <= 0) {
          // Pick new bytes; sometimes keep one plane to make stripes.
          lo = r() < 0.7 ? pool[(r() * pool.length) | 0] : (r() * 256) | 0;
          // The high plane is mostly empty, so the block reads light with dark
          // streaks instead of a solid dark mass.
          if (r() < 0.6) hi = r() < DARK ? (r() < 0.7 ? pool[(r() * pool.length) | 0] : (r() * 256) | 0) : 0;
          hold = mode < 0.35 ? 8 : mode < 0.7 ? ((r() * 4) | 0) : 0; // repeat rows -> vertical stripes
        }
        for (let b = 0; b < 8; b++) {
          const v = ((lo >> (7 - b)) & 1) | (((hi >> (7 - b)) & 1) << 1);
          const x = tx * 8 + b, y = ty * 8 + row;
          if (inShape(x, y)) px[y][x] = v;
        }
      }
    }
  }
  return px;
}
// Paths per shade, as horizontal runs.
export function paths(px) {
  const out = { 0: '', 1: '', 2: '', 3: '' };
  for (let y = 0; y < N; y++) {
    let x = 0;
    while (x < N) {
      const v = px[y][x];
      if (v < 0) { x++; continue; }
      let e = x; while (e < N && px[y][e] === v) e++;
      out[v] += `M${x} ${y}h${e - x}v1H${x}z`;
      x = e;
    }
  }
  return out;
}
// The ┘ silhouette, for the white base.
export const SHAPE = 'M32 0H56V56H0V32H32Z';
