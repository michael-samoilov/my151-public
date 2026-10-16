import { useLayoutEffect, useRef, useState } from 'react';
import { BASE_TINT } from '../theme';

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
      const radius = parseFloat(getComputedStyle(gymCard).borderTopLeftRadius) || 0;
      const x1 = rr.right - h.left;
      const x2 = gc.left - h.left + radius;
      if (x2 - x1 < 8) { setD(null); return; }
      const y1t = clamp(rr.top);
      const y1b = clamp(rr.bottom);
      const y2t = clamp(gc.top);
      const y2b = clamp(gc.bottom);
      if (y1b - y1t < 1 || y2b - y2t < 1) { setD(null); return; }
      const face = row.querySelector('.grid');
      const rowR0 = face ? parseFloat(getComputedStyle(face).borderTopRightRadius) || 0 : 0;
      const rowR = Math.min(rowR0, (y1b - y1t) / 2);
      const xr = x1 - rowR;
      const mx = (lc.right + gc.left) / 2 - h.left;
      setD(
        `M ${xr} ${y1t} C ${mx} ${y1t} ${mx} ${y2t} ${x2} ${y2t}` +
        ` L ${x2} ${y2b} C ${mx} ${y2b} ${mx} ${y1b} ${xr} ${y1b}` +
        ` A ${rowR} ${rowR} 0 0 0 ${x1} ${y1b - rowR}` +
        ` L ${x1} ${y1t + rowR}` +
        ` A ${rowR} ${rowR} 0 0 0 ${xr} ${y1t} Z`,
      );
    };

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
