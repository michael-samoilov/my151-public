import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { ToolDef } from '../../../../api/_crossTool';
import { colorOf, eulerScene, inclusive, regionKey, regionName, type Measure } from './eulerLayout';

const INK = 'rgb(15, 23, 42)';
const HALO = 'rgb(255, 255, 255)';

let measureCtx: CanvasRenderingContext2D | null | undefined;

/** Canvas text width in the SVG's own font, with a margin for tabular digits. */
function textWidth(text: string, size: number, family: string): number {
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * size * 0.62;
  measureCtx.font = `700 ${size}px ${family}`;
  return measureCtx.measureText(text).width * 1.05;
}

/**
 * One area-exact Euler diagram of tool usage: each region's area is its
 * browser count. Small regions get a leader to a named label.
 */
export function ToolEuler({ regions, catalog }: { regions: Record<string, number>; catalog: ToolDef[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  // A new object once the web font loads, so the labels are measured again.
  const [face, setFace] = useState({ family: 'sans-serif' });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    const family = getComputedStyle(el).fontFamily || 'sans-serif';
    setFace({ family });
    void document.fonts?.ready.then(() => setFace({ family }));
    return () => ro.disconnect();
  }, []);
  const scene = useMemo(() => {
    const measure: Measure = (text, size) => textWidth(text, size, face.family);
    return width > 0 ? eulerScene(regions, catalog, width, measure) : null;
  }, [regions, catalog, width, face]);
  const present = catalog.filter((t) => inclusive(t.id, regions) > 0);
  const browsers = Object.values(regions).reduce((s, n) => s + n, 0);
  // Every combination of the tools in use that no browser has: it has no
  // cell, so it is listed as text instead.
  const ids = present.map((t) => t.id);
  const zeros: string[] = [];
  for (let m = 1; m < 1 << ids.length; m++) {
    const key = regionKey(ids.filter((_, i) => m & (1 << i)));
    if (!regions[key]) zeros.push(`${regionName(key, catalog)} 0`);
  }
  const summary = [
    present.map((t) => `${t.short} ${inclusive(t.id, regions)}`).join(', '),
    Object.entries(regions)
      .filter(([, n]) => n > 0)
      .map(([key, n]) => `${regionName(key, catalog)}${key.includes('+') ? '' : ' only'} ${n}`)
      .join(', '),
    ...zeros,
  ].join('. ');

  return (
    <div ref={wrapRef} className="min-w-0">
      {present.length === 0 ? (
        <p className="text-xs text-muted-foreground">No browsers in this range.</p>
      ) : scene ? (
        <>
        <svg
          width={scene.width}
          height={scene.height}
          viewBox={`0 0 ${scene.width} ${scene.height}`}
          className="block"
          role="img"
          aria-label={`${summary}. ${browsers} browsers.`}
        >
          {catalog.map((t, i) => {
            const o = scene.outlines[t.id];
            return o ? <path key={t.id} d={o.fill} fill={colorOf(t.id, i)} fillOpacity={0.38} /> : null;
          })}
          {catalog.map((t, i) => {
            const o = scene.outlines[t.id];
            return o ? (
              <path key={t.id} d={o.stroke} fill="none" stroke={colorOf(t.id, i)} strokeWidth={scene.strokeW} />
            ) : null;
          })}
          {scene.layout.cells.map((c) => (
            <rect key={c.key} data-region={c.key} x={c.x} y={c.y} width={c.w} height={c.h} fill="transparent">
              <title>{`${regionName(c.key, catalog)} ${regions[c.key] ?? 0}`}</title>
            </rect>
          ))}
          {scene.leaders.map((l) => (
            <g key={l.key} data-leader={l.key}>
              <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke={HALO} strokeWidth={3} strokeLinecap="round" />
              <line x1={l.from.x} y1={l.from.y} x2={l.to.x} y2={l.to.y} stroke={INK} strokeOpacity={0.65} strokeWidth={1} />
              <circle cx={l.from.x} cy={l.from.y} r={Math.max(1.75, scene.font / 8)} fill={INK} stroke={HALO} strokeWidth={1} />
            </g>
          ))}
          {[...scene.inside, ...scene.leaders].map((l) => (
            <text
              key={l.key}
              data-testid="cross-tool-region-label"
              data-region-label={l.key}
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              dominantBaseline="central"
              fontSize={scene.font}
              fontWeight={700}
              fill={INK}
              stroke={HALO}
              strokeWidth={Math.max(3, Math.round(scene.font * 0.25))}
              strokeLinejoin="round"
              paintOrder="stroke"
              className="tabular-nums"
            >
              {l.text}
            </text>
          ))}
          {scene.totals.map((l) => (
            <text
              key={l.key}
              data-testid="cross-tool-total"
              x={l.x}
              y={l.y}
              textAnchor={l.anchor}
              dominantBaseline="central"
              fontSize={scene.font}
              fontWeight={700}
              fill={colorOf(l.key, catalog.findIndex((t) => t.id === l.key))}
              stroke={HALO}
              strokeWidth={Math.max(3, Math.round(scene.font * 0.25))}
              strokeLinejoin="round"
              paintOrder="stroke"
              className="tabular-nums"
            >
              {l.text}
            </text>
          ))}
        </svg>
        {zeros.length > 0 && (
          <p data-testid="cross-tool-zero-regions" className="text-center font-bold tabular-nums" style={{ fontSize: scene.font, color: INK }}>
            {zeros.join(' · ')}
          </p>
        )}
        </>
      ) : null}
    </div>
  );
}
