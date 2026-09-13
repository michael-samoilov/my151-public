import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { EraOverlap, ToolDef } from '../../../../api/_crossTool';
import {
  areasFromRegions,
  colorOf,
  inclusive,
  intersection,
  layoutCircles,
  placeRegionLabels,
} from './vennAreas';

function captionOf(era: EraOverlap): string {
  return era.shortLabel || era.label;
}

export function ToolVenn({
  era,
  catalog,
}: {
  era: EraOverlap;
  catalog: ToolDef[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(160);
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const height = Math.round(Math.max(152, Math.min(width * 0.52, 220)));
  const areas = useMemo(() => areasFromRegions(era.regions, catalog), [era.regions, catalog]);
  const circles = useMemo(() => layoutCircles(areas, width, height), [areas, width, height]);
  const labels = useMemo(
    () => placeRegionLabels(era.regions, catalog, circles, width, height),
    [era.regions, catalog, circles, width, height],
  );
  const present = catalog.filter((t) => inclusive(t.id, era.regions) > 0);
  const both = present.length === 2 ? intersection(present.map((t) => t.id), era.regions) : 0;
  const summary = [
    ...present.map((t) => `${t.short} ${inclusive(t.id, era.regions)}`),
    ...(present.length === 2 ? [`both ${both}`] : []),
  ].join(', ');
  const title = captionOf(era);

  return (
    <div ref={wrapRef} className="flex min-w-0 flex-col gap-1">
      <div className="truncate text-[0.7rem] font-semibold leading-tight text-muted-foreground" title={era.label}>
        {title}
      </div>
      {present.length === 0 ? (
        <p className="text-xs text-muted-foreground">No browsers in this era.</p>
      ) : (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          overflow="visible"
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
          {labels.map((l) => {
            const name = l.key.includes('+') ? 'both' : (catalog.find((t) => t.id === l.key)?.short ?? l.key);
            const tip = `${name} ${l.count}`;
            return (
              <g key={l.key}>
                {l.placement === 'outside' && (
                  <line
                    x1={l.fromX}
                    y1={l.fromY}
                    x2={l.x}
                    y2={l.y}
                    stroke="currentColor"
                    strokeOpacity={0.45}
                    strokeWidth={1}
                  />
                )}
                <circle cx={l.fromX} cy={l.fromY} r={l.hitR} fill="transparent">
                  <title>{tip}</title>
                </circle>
                <text
                  x={l.x}
                  y={l.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fontSize={12}
                  fontWeight={700}
                  fill="rgb(15, 23, 42)"
                  stroke="rgb(255, 255, 255)"
                  strokeWidth={3}
                  paintOrder="stroke"
                  className="tabular-nums"
                >
                  <title>{tip}</title>
                  {l.count}
                </text>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}
