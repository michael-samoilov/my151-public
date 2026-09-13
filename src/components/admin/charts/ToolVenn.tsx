import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { normalizeSolution, scaleSolution, venn, type VennArea } from 'venn.js';
import type { EraOverlap, ToolDef } from '../../../../api/_crossTool';
import { areasFromRegions, inclusive, intersection } from './vennAreas';

const COLOR_BY_ID: Record<string, string> = {
  dex: 'rgb(37, 99, 235)',
  league: 'rgb(217, 119, 6)',
};
const FALLBACK = ['rgb(14, 116, 94)', 'rgb(109, 40, 217)', 'rgb(190, 18, 60)'];

function colorOf(id: string, index: number): string {
  return COLOR_BY_ID[id] ?? FALLBACK[index % FALLBACK.length];
}

function layoutCircles(areas: VennArea[], width: number, height: number) {
  const singles = areas.filter((a) => a.sets.length === 1);
  if (singles.length === 0 || width < 8 || height < 8) return {};
  if (singles.length === 1) {
    const r = Math.max(8, Math.min(width, height) / 2 - 8);
    return { [singles[0].sets[0]]: { x: width / 2, y: height / 2, radius: r } };
  }
  const raw = venn(areas);
  const oriented = normalizeSolution(raw, Math.PI / 2);
  return scaleSolution(oriented, width, height, 10);
}

export function ToolVenn({
  era,
  catalog,
}: {
  era: EraOverlap;
  catalog: ToolDef[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(280);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const height = 180;
  const areas = useMemo(() => areasFromRegions(era.regions, catalog), [era.regions, catalog]);
  const circles = useMemo(() => layoutCircles(areas, width, height), [areas, width, height]);
  const present = catalog.filter((t) => inclusive(t.id, era.regions) > 0);
  const both = present.length === 2 ? intersection(present.map((t) => t.id), era.regions) : 0;
  const summary = [
    ...present.map((t) => `${t.short} ${inclusive(t.id, era.regions)}`),
    ...(present.length === 2 ? [`both ${both}`] : []),
  ].join(', ');

  return (
    <div ref={wrapRef} className="flex flex-col gap-2">
      <div className="text-[0.7rem] font-semibold text-muted-foreground">{era.label}</div>
      {present.length === 0 ? (
        <p className="text-xs text-muted-foreground">No browsers in this era.</p>
      ) : (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={`${era.label}: ${summary}. ${era.browsers} browsers.`}
        >
          {present.map((t, i) => {
            const c = circles[t.short];
            if (!c) return null;
            const fill = colorOf(t.id, i);
            return (
              <circle
                key={t.id}
                cx={c.x}
                cy={c.y}
                r={c.radius}
                fill={fill}
                fillOpacity={0.38}
                stroke={fill}
                strokeWidth={1.5}
              />
            );
          })}
        </svg>
      )}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] font-semibold text-muted-foreground">
        {present.map((t, i) => (
          <span key={t.id} className="inline-flex items-center gap-1.5">
            <span className="inline-block size-2 rounded-full" style={{ background: colorOf(t.id, i) }} />
            {t.short} {inclusive(t.id, era.regions)}
          </span>
        ))}
        {present.length === 2 && <span>both {both}</span>}
        <span className="font-medium">· {era.browsers} browsers</span>
      </div>
    </div>
  );
}
