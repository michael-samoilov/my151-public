import { useLayoutEffect, useRef, useState } from 'react';
import { BASE_TINT } from '../theme';

/**
 * A sankey-like ribbon that ties the open gym's league row to its trainer card.
 *
 * On desktop the league and the card sit in two panes with an empty gutter
 * between their centred columns. The ribbon fills that gutter: narrow on the
 * left, at the selected row's own height against the league card's right edge,
 * and fanning to the card's full height on the right — so "this row" and "this
 * card" read as one flow. It carries the gym's own type colour, drawn
 * translucent at `BASE_TINT` so it composites to the row's `base` colour over
 * white — the row flows straight into it with no seam, yet it stays a tint of
 * the type rather than a flat fill.
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
      // The narrow end reaches the trainer row's own right edge, not the league
      // card's, so it touches the row it belongs to. The wide end runs a corner
      // radius *under* the gym card's left edge, so the ribbon sits behind the
      // card's rounded corners and fills the wedge they would otherwise leave.
      const radius = parseFloat(getComputedStyle(gymCard).borderTopLeftRadius) || 0;
      const x1 = rr.right - h.left;
      const x2 = gc.left - h.left + radius;
      if (x2 - x1 < 8) { setD(null); return; } // no real gutter to fill
      const y1t = clamp(rr.top);
      const y1b = clamp(rr.bottom);
      const y2t = clamp(gc.top);
      const y2b = clamp(gc.bottom);
      if (y1b - y1t < 1 || y2b - y2t < 1) { setD(null); return; }
      // Bend the S-curves in the visible gutter between the two cards, not in
      // the parts that now tuck under them.
      const mx = (lc.right + gc.left) / 2 - h.left;
      setD(
        `M ${x1} ${y1t} C ${mx} ${y1t} ${mx} ${y2t} ${x2} ${y2t}` +
        ` L ${x2} ${y2b} C ${mx} ${y2b} ${mx} ${y1b} ${x1} ${y1b} Z`,
      );
    };

    // A continuous rAF loop rather than event listeners. The ribbon has to
    // track three live boxes across every layout change — a pane resize, the
    // card re-fitting over many frames, the footer's "About this tool"
    // expanding, the browser pane opening — and any event-driven scheme misses
    // some of them or reads mid-settle. Re-measuring every frame never misses;
    // `compute` only sets state when the path string actually changes, so a
    // still page does three getBoundingClientRects and no React work.
    let raf = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      compute();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
    };
  }, [openCard]);

  return (
    <svg ref={ref} className="pointer-events-none absolute inset-0 z-10 h-full w-full" aria-hidden>
      {d && <path d={d} fill={color} fillOpacity={BASE_TINT} />}
    </svg>
  );
}
