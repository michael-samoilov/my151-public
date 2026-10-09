// Bug-report icon drafts, drawn from the official Gen IX Bug glyph.
// Points are in the glyph's pixels: public/sprites/types/small/7.png scaled 10x to
// 600 px, then mapped to the 24-unit lucide grid (2-unit stroke, round caps).
// Print one: node -e "import('./bug-glyph-geometry.mjs').then(m => console.log(m.ICONS.t2Open.join('')))"
export const GLYPH = { cx: 299.5, cy: 323.8, r: 169.2 };       // body circle fitted to the wing arcs
export const MAP_NEW = { s: 0.05467, cx: 12, cy: 13.0 };         // circle r 9.25, head top at 2.3
const f = (n) => +n.toFixed(2);
const M = MAP_NEW;
const U = (x, y) => `${f(M.cx + (x - GLYPH.cx) * M.s)} ${f(M.cy + (y - GLYPH.cy) * M.s)}`;
const mx = (x) => 2 * GLYPH.cx - x;                              // mirror across the centre line
const R = f(GLYPH.r * M.s);
// Measured points (left side; the right side mirrors them).
const MOUTH = [178, 206];           // gap centreline meets the silhouette
const PEAK_Y = 128;                 // head top
const WAIST = [270, 294];           // wing inner corner, narrowest point of the centre gap
const TAIL = [215.3, 470.5];        // wing inner edge meets the circle
const sideX = (y) => WAIST[0] + ((TAIL[0] - WAIST[0]) * (y - WAIST[1])) / (TAIL[1] - WAIST[1]);

function build({ rise = 0, closeHead = false, closeTail = false, rungs = [335, 390, 445], sag = 11, widen = 1, float = 0 } = {}) {
  const sx = (y) => GLYPH.cx - (GLYPH.cx - sideX(y)) * widen;
  const tail = [sx(TAIL[1]), TAIL[1]];
  const peak = PEAK_Y - rise;
  // Head top: a circular arc from mouth to mouth through the peak.
  const half = GLYPH.cx - MOUTH[0], sag0 = MOUTH[1] - peak, hr = (half * half + sag0 * sag0) / (2 * sag0);
  const out = [];
  out.push(`<path d="M${U(...MOUTH)}A${f(hr * M.s)} ${f(hr * M.s)} 0 0 1 ${U(mx(MOUTH[0]), MOUTH[1])}"/>`);
  // Body: circle arcs from each mouth down to its tail (and across the bottom if closed).
  if (closeTail) out.push(`<path d="M${U(...MOUTH)}A${R} ${R} 0 1 0 ${U(mx(MOUTH[0]), MOUTH[1])}"/>`);
  else out.push(`<path d="M${U(...MOUTH)}A${R} ${R} 0 0 0 ${U(...tail)}"/>`, `<path d="M${U(mx(MOUTH[0]), MOUTH[1])}A${R} ${R} 0 0 1 ${U(mx(tail[0]), tail[1])}"/>`);
  // Separator along the gap centreline, turning down through the waist into the triangle side.
  const waistX = sx(WAIST[1]);
  const sep = (m) => `<path d="M${U(m(MOUTH[0]), MOUTH[1])}C${U(m(208), 228)} ${U(m(240), 246)} ${U(m(256), 250)}C${U(m(waistX - 4), 252)} ${U(m(waistX), 262)} ${U(m(waistX), WAIST[1])}L${U(m(tail[0]), tail[1])}"/>`;
  out.push(sep((x) => x), sep(mx));
  if (closeHead) out.push(`<path d="M${U(250, 247)}Q${U(GLYPH.cx, 250)} ${U(mx(250), 247)}"/>`);
  // Rungs: bowed downward; `float` pulls their ends in from the sides (glyph px).
  for (const y of rungs) {
    const x0 = sx(y) + float;
    out.push(`<path d="M${U(x0, y)}Q${U(GLYPH.cx, y + 2 * sag)} ${U(mx(x0), y)}"/>`);
  }
  return out;
}
export const ICONS = {

  t1Traced: build({ closeHead: true }),
  t2Open: build(),
  t3Mound: build({ rise: 22 }),
  t4Tail: build({ closeTail: true }),
  t5Bow: build({ sag: 18 }),
};
