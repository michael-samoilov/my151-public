// Dark type icon, drawn from the Elginive Gen IX Dark glyph in the converter's layout (draft A1):
// one stroke runs around the outside of the glyph, and one runs down the middle of the cavity
// between the bowl and the pupil. The glyph is three ellipses, each within 0.1% of its source
// curve ends: the outer edge, the cavity, and the pupil (cut flat across its top).
// Source: public/sprites/types/vector/dark-glyph.04207c247e36.svg, in its own units.
// Print the icon: node docs/design/tools-menu-icons/dark-glyph-geometry.mjs
const AXIS = 1558.55;
const S = 0.0834;                          // grid units per glyph unit: the outer stroke spans x 2 to 22
const GAP = 13.8;                          // glyph units (1.15 grid units) from the glyph to the outer stroke
const OUTER = { rx: 106.1, ry: 94.2 };     // centre (AXIS, 2000.9); the arc's endpoints place it
const CAVITY = { cy: 2003.6, rx: 32.75, ry: 48.45 };   // midway between the cavity edge and the pupil
const PUPIL_TOP = 1974.7;
// Inner edge of the left horn, from its tip to where the cavity starts, and its normals at both ends.
const HORN = { tip: [1477.8, 1942], c2: [1489.5, 1954.2], c1: [1504.6, 1963.7], end: [1521.8, 1969.3] };
const N_TIP = [0.722, -0.692];
const N_END = [0.31, -0.95];
const TIP = [1475.7, 1942];                // where the outer ellipse ends at the horn's point
const TIP_OUT = [-0.742, -0.67];           // the outer ellipse's normal there

/** Michael's header size, by eye, for `pathScale()`: beside the globe (104%) and bug (116%). Measured balance is 121%. */
export const HEADER_SCALE = 1.125;

const f = (n) => String(+n.toFixed(2));
const at = ([x, y]) => [12 + (x - AXIS) * S, 4.47 + (y - 1928.2) * S];
const shift = ([x, y], [nx, ny]) => [x + GAP * nx, y + GAP * ny];
const pt = ([x, y]) => `${f(x)} ${f(y)}`;
const mirror = ([x, y]) => [24 - x, y];

const a = at(shift(TIP, TIP_OUT));
const h = at(shift(HORN.tip, N_TIP));
const c2 = at(shift(HORN.c2, N_TIP));
const c1 = at(shift(HORN.c1, N_END));
const b = at(shift(HORN.end, N_END));
// Top: one cubic from horn to horn, tangent to both, dipping to GAP above the pupil's flat top.
const dip = at([AXIS, PUPIL_TOP - GAP])[1];
const len = Math.hypot(b[0] - c1[0], b[1] - c1[1]);
const dir = [(b[0] - c1[0]) / len, (b[1] - c1[1]) / len];
const t = (dip - b[1]) / (0.75 * dir[1]);
const ca = [b[0] + t * dir[0], b[1] + t * dir[1]];
const top = (u) => [0, 1].map((i) => (1 - u) ** 3 * b[i] + 3 * (1 - u) ** 2 * u * ca[i] + 3 * (1 - u) * u ** 2 * mirror(ca)[i] + u ** 3 * mirror(b)[i]);
// The cavity line starts where it meets the top.
const [cy, crx, cry] = [at([AXIS, CAVITY.cy])[1], CAVITY.rx * S, CAVITY.ry * S];
const outside = ([x, y]) => ((x - 12) / crx) ** 2 + ((y - cy) / cry) ** 2 > 1;
let lo = 0, hi = 0.5;
for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (outside(top(m))) lo = m; else hi = m; }
const j = top(hi);

const [erx, ery, tr] = [(OUTER.rx + GAP) * S, (OUTER.ry + GAP) * S, GAP * S];
export const PATHS = [
  `M${pt(a)}A${f(erx)} ${f(ery)} 0 1 0 ${pt(mirror(a))}A${f(tr)} ${f(tr)} 0 0 0 ${pt(mirror(h))}` +
    `C${pt(mirror(c2))} ${pt(mirror(c1))} ${pt(mirror(b))}C${pt(mirror(ca))} ${pt(ca)} ${pt(b)}` +
    `C${pt(c1)} ${pt(c2)} ${pt(h)}A${f(tr)} ${f(tr)} 0 0 0 ${pt(a)}Z`,
  `M${pt(j)}A${f(crx)} ${f(cry)} 0 1 0 ${pt(mirror(j))}`,
];

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PATHS.map((d) => `<path d="${d}"/>`).join('')}</svg>`);
}
