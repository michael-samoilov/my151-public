import type { Locator, Page } from '@playwright/test';

/**
 * Read what a control actually painted, not what its boxes say.
 *
 * Every layout check in this suite asks the DOM, and the DOM cannot see a
 * rasterisation fault: a disc and the mark inside it can be centred to the
 * pixel in layout and still land on the screen with the mark a pixel off,
 * because the two are painted separately at a fractional origin and snap to
 * the device grid independently. The only witness to that is the bitmap.
 *
 * These helpers screenshot one element at the test's device pixel ratio and
 * measure the ink in it. They return geometry -- centres, extents, ramps --
 * never a baseline to compare against, so nothing here churns when a colour
 * or a size changes on purpose. The bitmap is decoded in a scratch page with
 * a canvas, which keeps the suite free of an image library.
 *
 * Sub-pixel accuracy matters here, because the faults are sub-pixel. A
 * thresholded mask moves by a third of a pixel as the antialiased edge under
 * it shifts phase, which is the size of the fault being looked for. So the
 * measures below weight each pixel by how much of the colour it holds
 * rather than counting it in or out, and a disc's centre is read from where
 * its edges are, not from which pixels are blue.
 */

type Coverage = string;

export const INK = {
  blue: 'Math.min(1, Math.max(0, (250 - r) / (250 - 37)))',
  red: 'Math.min(1, Math.max(0, (250 - g) / (250 - 68)))',
  whiteOnBlue: 'Math.min(1, Math.max(0, (r - 37) / (255 - 37)))',
  whiteOnRed: 'Math.min(1, Math.max(0, (g - 68) / (255 - 68)))',
  coloured: 'Math.min(1, (Math.max(r, g, b) - Math.min(r, g, b)) / 60)',
} as const;

interface DiscMark {
  disc: { x: number; y: number; r: number };
  ink: { x: number; y: number } | null;
  box: { x: number; y: number } | null;
  offset: { ink: { dx: number; dy: number }; box: { dx: number; dy: number } } | null;
}

interface PhaseSweep {
  offsets: { dx: number; dy: number }[];
  wander: { x: number; y: number; max: number };
}

interface PillEnds {
  ramp: { left: number; right: number };
  tip: { left: number; right: number };
  inkWidth: number;
  boxWidth: number;
}

async function analyse<T>(page: Page, el: Locator, body: string): Promise<T> {
  const png = (await el.screenshot()).toString('base64');
  const lab = await page.context().newPage();
  try {
    await lab.setContent('<canvas id="c"></canvas>');
    return await lab.evaluate(
      async ([b64, src]) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();
        const c = document.getElementById('c') as HTMLCanvasElement;
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d')!;
        ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, c.width, c.height).data;
        return new Function('d', 'w', 'h', src)(d, c.width, c.height) as T;
      },
      [png, body] as const,
    );
  } finally {
    await lab.close();
  }
}

export async function discMark(page: Page, disc: Locator, discInk: Coverage, markInk: Coverage): Promise<DiscMark> {
  return analyse<DiscMark>(page, disc, `
    const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const cover = (x, y) => { if (x < 0 || y < 0 || x >= w || y >= h) return 0; const [r, g, b] = px(x, y); return (${discInk}); };
    const mark = (x, y) => { const [r, g, b] = px(x, y); return (${markInk}); };
    // From (x0, y0) step by (sx, sy) until the disc's colour runs out for
    // good; the edge is that pixel's near side plus the part of it the disc
    // covers. "For good" steps over the mark: a stroke is a gap of a few
    // pixels with the disc's colour on its far side, the outside is not.
    const GAP = Math.max(4, Math.round(Math.min(w, h) / 6));
    const edge = (x0, y0, sx, sy) => {
      let x = x0, y = y0, steps = 0, lastIn = null;
      while (steps <= w + h) {
        if (cover(x, y) >= 0.98) lastIn = [x, y];
        else if (lastIn) {
          let ahead = 0;
          for (let g = 1; g <= GAP; g++) if (cover(x + g * sx, y + g * sy) >= 0.98) { ahead = g; break; }
          if (!ahead) break;
          x += ahead * sx; y += ahead * sy; steps += ahead; continue;
        }
        x += sx; y += sy; steps++;
      }
      if (!lastIn) return null;
      const ex = lastIn[0] + sx, ey = lastIn[1] + sy;
      const c = cover(ex, ey);
      return sx ? (sx > 0 ? ex + c : ex + 1 - c) : (sy > 0 ? ey + c : ey + 1 - c);
    };
    const fit = (cx0, cy0, r0) => {
      const mids = { x: [], y: [] };
      const lo = Math.max(1, Math.round(r0 * 0.33)), hi = Math.max(lo + 1, Math.round(r0 * 0.8));
      for (let k = lo; k <= hi; k++) for (const s of [-1, 1]) {
        const y = Math.round(cy0 + s * k);
        if (y < 0 || y >= h) continue;
        const L = edge(Math.round(cx0), y, -1, 0), R = edge(Math.round(cx0), y, 1, 0);
        if (L !== null && R !== null && R - L > r0) mids.x.push((L + R) / 2);
        const x = Math.round(cx0 + s * k);
        if (x < 0 || x >= w) continue;
        const T = edge(x, Math.round(cy0), 0, -1), B = edge(x, Math.round(cy0), 0, 1);
        if (T !== null && B !== null && B - T > r0) mids.y.push((T + B) / 2);
      }
      if (mids.x.length < 3 || mids.y.length < 3) return null;
      const mean = (v) => v.reduce((a, b) => a + b, 0) / v.length;
      const cx = mean(mids.x), cy = mean(mids.y);
      // The radius from the full chord through the centre.
      const L = edge(Math.round(cx), Math.round(cy), -1, 0), R = edge(Math.round(cx), Math.round(cy), 1, 0);
      const T = edge(Math.round(cx), Math.round(cy), 0, -1), B = edge(Math.round(cx), Math.round(cy), 0, 1);
      const rad = ((R ?? cx) - (L ?? cx) + (B ?? cy) - (T ?? cy)) / 4;
      return { cx, cy, rad };
    };
    const r0 = Math.min(w, h) / 2;
    const first = fit(w / 2, h / 2, r0 * 0.9);
    if (!first) return { disc: { x: 0, y: 0, r: 0 }, ink: null, box: null, offset: null };
    const second = fit(first.cx, first.cy, first.rad) ?? first;
    const { cx, cy, rad } = second;
    // The mark, inside the disc only.
    let sx = 0, sy = 0, sw = 0, minX = w, minY = h, maxX = -1, maxY = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) > rad * 0.86) continue;
      const m = mark(x, y);
      if (m <= 0.02) continue;
      sx += (x + 0.5) * m; sy += (y + 0.5) * m; sw += m;
      if (m >= 0.5) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
    const disc = { x: +cx.toFixed(3), y: +cy.toFixed(3), r: +rad.toFixed(2) };
    if (sw < 1 || maxX < 0) return { disc, ink: null, box: null, offset: null };
    const ink = { x: +(sx / sw).toFixed(3), y: +(sy / sw).toFixed(3) };
    const box = { x: +((minX + maxX + 1) / 2).toFixed(3), y: +((minY + maxY + 1) / 2).toFixed(3) };
    return { disc, ink, box, offset: {
      ink: { dx: +(ink.x - cx).toFixed(3), dy: +(ink.y - cy).toFixed(3) },
      box: { dx: +(box.x - cx).toFixed(3), dy: +(box.y - cy).toFixed(3) } } };
  `);
}

/**
 * Whether a mark stays put in its disc as the disc moves across a pixel.
 *
 * This is the test for the fault itself rather than for one instance of
 * it. A disc and a mark painted as two layers each snap to the device grid
 * on their own, so their relative position depends on which fraction of a
 * pixel the control happens to sit at -- and one card shows only a few of
 * those fractions. Sliding one control through eight of them shows all of
 * them: a single raster keeps its mark within measurement noise of the same
 * offset at every step, two layers wander by up to a device pixel.
 *
 * The control is moved with a margin, which is layout: the button ends up
 * at a fractional position exactly as the card's own scaling leaves it, and
 * no compositing layer is created that could snap it whole.
 */
export async function phaseSweep(
  page: Page, button: Locator, discInk: Coverage, markInk: Coverage, steps = 8,
): Promise<PhaseSweep> {
  const offsets: { dx: number; dy: number }[] = [];
  try {
    for (let k = 0; k < steps; k += 1) {
      const fx = k / steps;
      const fy = ((k * 3) % steps) / steps;
      await button.evaluate((el, [x, y]) => {
        (el as HTMLElement).style.marginLeft = `${x}px`;
        (el as HTMLElement).style.marginTop = `${y}px`;
      }, [fx, fy] as const);
      const m = await discMark(page, button.locator('svg'), discInk, markInk);
      if (!m.offset) throw new Error(`phase ${k}: no mark found in the disc`);
      offsets.push(m.offset.ink);
    }
  } finally {
    await button.evaluate((el) => {
      (el as HTMLElement).style.marginLeft = '';
      (el as HTMLElement).style.marginTop = '';
    });
  }
  const span = (v: number[]) => +(Math.max(...v) - Math.min(...v)).toFixed(3);
  const x = span(offsets.map((o) => o.dx));
  const y = span(offsets.map((o) => o.dy));
  return { offsets, wander: { x, y, max: Math.max(x, y) } };
}

export async function pillEnds(page: Page, el: Locator, ink: Coverage): Promise<PillEnds> {
  return analyse<PillEnds>(page, el, `
    const px = (x, y) => { const i = (y * w + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const cover = (x, y) => { const [r, g, b] = px(x, y); return (${ink}); };
    const cols = []; for (let x = 0; x < w; x++) { let n = 0; for (let y = 0; y < h; y++) n += cover(x, y); cols.push(n); }
    const peak = Math.max(...cols);
    if (peak < 1) return { ramp: { left: 0, right: 0 }, tip: { left: 0, right: 0 }, inkWidth: 0, boxWidth: w };
    let first = 0; while (first < w && cols[first] < peak * 0.05) first++;
    let last = w - 1; while (last >= 0 && cols[last] < peak * 0.05) last--;
    let fullL = first; while (fullL < w && cols[fullL] < peak * 0.9) fullL++;
    let fullR = last; while (fullR >= 0 && cols[fullR] < peak * 0.9) fullR--;
    const f = (v) => +v.toFixed(2);
    return { ramp: { left: fullL - first, right: last - fullR },
             tip: { left: f(cols[first] / peak), right: f(cols[last] / peak) },
             inkWidth: last - first + 1, boxWidth: w };
  `);
}
