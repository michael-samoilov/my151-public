import { useLayoutEffect, useRef, useState } from 'react';

/**
 * A sankey-like ribbon that ties the open gym's league row to its trainer card.
 *
 * On desktop the league and the card sit in two panes with an empty gutter
 * between their centred columns. The ribbon fills that gutter: narrow on the
 * left, at the selected row's own height against the league card's right edge,
 * and fanning to the card's full height on the right — so "this row" and "this
 * card" read as one flow. It carries the gym's own type colour, faint.
 *
 * It measures three live elements (the league card, the selected row, the gym
 * card) and redraws on scroll, resize and the fit settling, because both panes
 * scroll on their own and the cards are fit-scaled after mount. Purely
 * decorative: `pointer-events-none`, `aria-hidden`, and it draws only inside
 * the gutter, never over either card.
 */
export function GymConnector({ openCard, color }: { openCard: number; color: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [d, setD] = useState<string | null>(null);

  useLayoutEffect(() => {
    const svg = ref.current;
    const host = svg?.parentElement;
    if (!svg || !host) return;

    const compute = () => {
      const leagueCard = document.querySelector('[data-lg-league-root]');
      const row = document.querySelector(`[data-testid="league-slot-${openCard}"]`);
      const gymCard = document.querySelector('[data-lg-card-root]');
      if (!leagueCard || !row || !gymCard) { setD(null); return; }
      const h = host.getBoundingClientRect();
      const lc = leagueCard.getBoundingClientRect();
      const rr = row.getBoundingClientRect();
      const gc = gymCard.getBoundingClientRect();
      const clamp = (y: number) => Math.max(0, Math.min(h.height, y - h.top));
      const x1 = lc.right - h.left;      // league card's right edge
      const x2 = gc.left - h.left;       // gym card's left edge
      if (x2 - x1 < 8) { setD(null); return; } // no real gutter to fill
      const y1t = clamp(rr.top);
      const y1b = clamp(rr.bottom);
      const y2t = clamp(gc.top);
      const y2b = clamp(gc.bottom);
      if (y1b - y1t < 1 || y2b - y2t < 1) { setD(null); return; }
      const mx = (x1 + x2) / 2; // control point x for both curved edges
      setD(
        `M ${x1} ${y1t} C ${mx} ${y1t} ${mx} ${y2t} ${x2} ${y2t}` +
        ` L ${x2} ${y2b} C ${mx} ${y2b} ${mx} ${y1b} ${x1} ${y1b} Z`,
      );
    };

    let raf = 0;
    const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(compute); };
    const viewports = Array.from(document.querySelectorAll('[data-lg-viewport]'));
    viewports.forEach((vp) => vp.addEventListener('scroll', schedule, { passive: true }));
    window.addEventListener('resize', schedule);
    const ro = new ResizeObserver(schedule);
    ro.observe(host);
    viewports.forEach((vp) => ro.observe(vp));

    // The cards fit-scale over the first frames after mount, so re-measure for a
    // short window; the state only changes when the path actually moves.
    let frames = 0;
    let settleRaf = 0;
    const settle = () => { compute(); if (++frames < 30) settleRaf = requestAnimationFrame(settle); };
    settleRaf = requestAnimationFrame(settle);

    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(settleRaf);
      viewports.forEach((vp) => vp.removeEventListener('scroll', schedule));
      window.removeEventListener('resize', schedule);
      ro.disconnect();
    };
  }, [openCard]);

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {d && <path d={d} fill={color} fillOpacity={0.17} />}
    </svg>
  );
}
