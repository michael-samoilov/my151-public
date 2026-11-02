export const N = 56, TILE = 8;
const NOTCH_TILES = 4;
export function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const inShape = (x, y) => !(x < NOTCH_TILES * TILE && y < NOTCH_TILES * TILE);
export let DARK = 0.45;
export const setDark = (d) => { DARK = d; };
export function generate(seed) {
  const r = mulberry32(seed);
  const px = Array.from({ length: N }, () => new Array(N).fill(-1));
  const romBytePool = [0x00, 0xff, 0xaa, 0x55, 0xf0, 0x0f, 0xcc, 0x33, 0x81, 0x7e, 0x18, 0xe7, 0xc3, 0x3c];
  for (let tx = 0; tx < 7; tx++) {
    let lowPlane = 0, highPlane = 0, rowsToRepeat = 0;
    for (let ty = 0; ty < 7; ty++) {
      const mode = r();
      for (let row = 0; row < 8; row++) {
        if (rowsToRepeat-- <= 0) {
          lowPlane = r() < 0.7 ? romBytePool[(r() * romBytePool.length) | 0] : (r() * 256) | 0;
          if (r() < 0.6) highPlane = r() < DARK ? (r() < 0.7 ? romBytePool[(r() * romBytePool.length) | 0] : (r() * 256) | 0) : 0;
          rowsToRepeat = mode < 0.35 ? 8 : mode < 0.7 ? ((r() * 4) | 0) : 0;
        }
        for (let b = 0; b < 8; b++) {
          const v = ((lowPlane >> (7 - b)) & 1) | (((highPlane >> (7 - b)) & 1) << 1);
          const x = tx * 8 + b, y = ty * 8 + row;
          if (inShape(x, y)) px[y][x] = v;
        }
      }
    }
  }
  return px;
}
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
export const SHAPE = 'M32 0H56V56H0V32H32Z';
