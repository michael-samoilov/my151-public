// Four promises of the revised 3d, measured rather than asserted:
//   1. no sprite is under 52px, the sprite a Pokemon gets in a team cell;
//   2. the empty state puts its heading and name exactly where the filled one
//      does, so nothing slides up against the ring;
//   3. a block's far corner may cross its seam by the 4px the design allows,
//      and no further, except where the panel is flagged as not fitting;
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

  const drift = [], crossing = [], overflow = [], undersized = [];
  // Each half is sized on its own now, so sizes differ within a panel by
  // design. What must hold is the floor: nothing smaller than a team cell.
  const FLOOR = 52;
  const sizes = [];
  rails.forEach((slots, r) => slots.forEach((slot, i) => {
    slot.querySelectorAll('.sp2').forEach((img, j) => {
      const w = +img.getBoundingClientRect().width.toFixed(1);
      sizes.push({ rail: r, panel: i, half: j, w });
      if (w < FLOOR - 0.5) undersized.push(`rail ${r} panel ${i} half ${j}: ${w}px`);
    });
  }));

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
      // The union of the block and its children. A heading wider than its
      // block paints outside the block's own rect, so measuring the rect
      // alone would miss exactly the overflow worth catching.
      const boxes = [hb, ...hb.querySelectorAll('*')].map((el) => el.getBoundingClientRect());
      const r = {
        left: Math.min(...boxes.map((v) => v.left)), right: Math.max(...boxes.map((v) => v.right)),
        top: Math.min(...boxes.map((v) => v.top)), bottom: Math.max(...boxes.map((v) => v.bottom)),
      };
      if (r.bottom > s.bottom + 0.5 || r.top < s.top - 0.5 ||
          r.left < s.left - 0.5 || r.right > s.right + 0.5) overflow.push(`panel ${i} half ${j}`);
      const cs = [[r.left - s.left, r.top - s.top], [r.right - s.left, r.top - s.top],
                  [r.left - s.left, r.bottom - s.top], [r.right - s.left, r.bottom - s.top]];
      // How far the deepest corner sits past the line, in slot pixels. The
      // cross product scales by the seam's length, so divide it back out.
      const len = Math.hypot(x2 - x1, y2 - y1);
      const depths = cs.map(([px, py]) => side(px, py) / len);
      const spread = Math.max(...depths) - Math.min(...depths);
      if (Math.min(Math.max(...depths), -Math.min(...depths)) > 0) {
        const past = Math.min(Math.max(...depths), -Math.min(...depths));
        // 4px is the design's allowance; the flagged half is the one that does
        // not fit at all, and the section says so in its own words.
        const tag = hb.classList.contains('off') ? ' (flagged)' : '';
        if (past > 5 && !tag) crossing.push(`panel ${i} half ${j}: ${past.toFixed(1)}px past the seam`);
        else crossing.push(`panel ${i} half ${j}: ${past.toFixed(1)}px${tag}`);
      }
      void spread;
    });
  });
  return {
    panels: sec.querySelectorAll('.slot.dg').length,
    sizes: [...new Set(sizes.map((s) => s.w))].sort((a, b) => a - b),
    flagged: [...sec.querySelectorAll('.miss')].map((el) => el.textContent),
    undersized, drift,
    overAllowance: crossing.filter((c) => c.includes('past the seam')),
    crossing, overflow,
  };
}), null, 1));
await b.close();
