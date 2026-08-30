// Four promises of the revised 3d, measured rather than asserted:
//   1. within a rail every sprite is the same size, and both halves get it;
//   2. the empty state puts its heading and name exactly where the filled one
//      does, so nothing slides up against the ring;
//   3. no content crosses its seam, except where the panel is flagged for it;
//   4. nothing overflows its slot.
import { chromium } from '/home/user/my151/node_modules/@playwright/test/index.mjs';
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await b.newPage({ viewport: { width: 1200, height: 900 }, deviceScaleFactor: 2 });
await page.goto('file:///tmp/claude-0/-home-user-my151/d74790d9-bbfd-5538-8993-a07d19412b2a/scratchpad/partner-slot.html');
await page.waitForTimeout(1500);
console.log(JSON.stringify(await page.evaluate(() => {
  const sec = document.querySelector('#s3d');
  const rails = [...sec.querySelectorAll('.rail')].map((r) => [...r.querySelectorAll('.slot.dg')]);
  // The two four-panel rails pair up by index; the coda rail is its own pair.
  const pairs = [];
  rails[0].forEach((f, i) => pairs.push([f, rails[1][i]]));
  if (rails[2]) pairs.push([rails[2][0], rails[2][1]]);

  const drift = [], crossing = [], overflow = [], unequal = [];
  const railSizes = rails.map((slots) => {
    const set = new Set();
    for (const s of slots) for (const img of s.querySelectorAll('.sp2')) {
      set.add(+img.getBoundingClientRect().width.toFixed(1));
    }
    return [...set];
  });
  railSizes.forEach((s, i) => { if (s.length > 1) unequal.push(`rail ${i}: sprites at ${s.join(', ')}`); });

  pairs.forEach(([f, e], i) => {
    const fs = f.getBoundingClientRect(), es = e.getBoundingClientRect();
    const grab = (slot, box) => [...slot.querySelectorAll('.hd2, .nm2')].map((el) => {
      const r = el.getBoundingClientRect();
      return { cls: el.className, top: +(r.top - box.top).toFixed(2), left: +(r.left - box.left).toFixed(2) };
    });
    const a = grab(f, fs), c = grab(e, es);
    if (a.length !== c.length) {
      drift.push(`pair ${i}: filled has ${a.length} text runs, empty has ${c.length}`);
      return;
    }
    a.forEach((el, j) => {
      // The heading has to hold both axes. A blank name line has no text, so
      // its horizontal centre carries no meaning -- only its baseline does.
      const dy = Math.abs(el.top - c[j].top), dx = Math.abs(el.left - c[j].left);
      if (dy > 0.5) drift.push(`pair ${i} ${el.cls}: baseline moves ${dy.toFixed(1)}px`);
      if (el.cls === 'hd2' && dx > 0.5) drift.push(`pair ${i} ${el.cls}: moves ${dx.toFixed(1)}px sideways`);
    });
  });

  sec.querySelectorAll('.slot.dg').forEach((slot, i) => {
    const s = slot.getBoundingClientRect();
    const line = slot.querySelector('.seam line');
    const x1 = +line.getAttribute('x1'), y1 = +line.getAttribute('y1');
    const x2 = +line.getAttribute('x2'), y2 = +line.getAttribute('y2');
    const side = (px, py) => (x2 - x1) * (py - y1) - (y2 - y1) * (px - x1);
    slot.querySelectorAll('.hb').forEach((hb, j) => {
      const r = hb.getBoundingClientRect();
      if (r.bottom > s.bottom + 0.5 || r.top < s.top - 0.5 ||
          r.left < s.left - 0.5 || r.right > s.right + 0.5) overflow.push(`panel ${i} half ${j}`);
      const cs = [[r.left - s.left, r.top - s.top], [r.right - s.left, r.top - s.top],
                  [r.left - s.left, r.bottom - s.top], [r.right - s.left, r.bottom - s.top]];
      if (new Set(cs.map(([px, py]) => Math.sign(side(px, py)))).size > 1) {
        // Only the half the section flags as not fitting may straddle a seam.
        crossing.push(`panel ${i} half ${j}${hb.classList.contains('off') ? ' (flagged)' : ''}`);
      }
    });
  });
  return {
    panels: sec.querySelectorAll('.slot.dg').length,
    railSizes,
    flagged: [...sec.querySelectorAll('.miss')].map((el) => el.textContent),
    unequal, drift,
    unflaggedCrossings: crossing.filter((c) => !c.endsWith('(flagged)')),
    crossing, overflow,
  };
}), null, 1));
await b.close();
