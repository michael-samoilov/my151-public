import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import React from 'react';
import { measureLabelWidth, MAX_LABEL_STRETCH } from '@/lib/sectionOutlines';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useAnalytics, fullBaseline } from '@/hooks/useAnalytics';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { countTypes, buildTypeRows } from '@/components/analytics/typeDistribution';
import { ButterflyChart, type ButterflyRow } from '@/components/analytics/ButterflyChart';
import { SuperimposedHistogram } from '@/components/analytics/SuperimposedHistogram';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { typeBadgePath } from '@/data/type-ids';
import type { TypeName } from '@/types/pokemon';

/** Aspect ratio (w/h) of the Gen IX type-name badge sprites (128×40). */
const TYPE_BADGE_ASPECT = 128 / 40;

/** Single font size shared by all stats text — chart headers, axis + value
 *  numbers, and the card subtitles — so they read uniformly. */
const STATS_TEXT = 'text-[0.625rem]';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

/** Minimum number of placed Pokémon before the detailed-stats panel is worth
 *  showing — below this the charts are too sparse to read and there isn't enough
 *  vertical content to justify the side panel. (Tunable; under QA.) */
export const STATS_MIN_POKEMON = 100;

/** Default per-chart vertical-height multipliers for the three detailed-stats
 *  charts (debug-tunable). BST/Generation are shorter so the Type chart — with its
 *  18 rows — gets the most room. */
export const DEFAULT_STATS_HEIGHTS = { type: 1.2, region: 0.6, bst: 0.7 };

/** Align yours + national histograms to shared bins (mirror of the analytics
 *  dashboard's helper) so the superimposed histogram can overlay both. */
function alignHistograms(
  yours: { bin: string; pct: number }[],
  national: { bin: string; pct: number }[],
  binSize: number,
  xTickInterval?: number,
) {
  const allBins = new Set<string>();
  for (const y of yours) allBins.add(y.bin);
  for (const n of national) allBins.add(n.bin);
  const bins = [...allBins].sort((a, b) => parseInt(a) - parseInt(b));
  const yoursMap = new Map(yours.map((y) => [y.bin, y.pct]));
  const nationalMap = new Map(national.map((n) => [n.bin, n.pct]));
  const merged = bins.map((bin) => ({
    x: parseInt(bin) + binSize / 2,
    nationalPct: nationalMap.get(bin) ?? 0,
    yoursPct: yoursMap.get(bin) ?? 0,
  }));
  const tickStep = xTickInterval ?? binSize;
  const minBin = parseInt(bins[0] ?? '0');
  const maxBin = parseInt(bins[bins.length - 1] ?? '0');
  const tickStart = Math.floor(minBin / tickStep) * tickStep;
  const tickEnd = maxBin + binSize;
  const xTicks: number[] = [];
  for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
  const xDomain: [number, number] = [tickStart, tickEnd];
  const yMax = Math.max(...merged.map((d) => Math.max(d.nationalPct, d.yoursPct)), 1);
  const yDomain = Math.ceil(yMax / 10) * 10;
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);
  return { merged, xTicks, xDomain, binSize, yDomain, yTicks };
}

/** Card chrome variants used to QA how the stats read alongside the dex:
 *  - 'bare'           : no chrome — charts sit directly on the canvas (export look)
 *  - 'card-title-out' : title on the canvas, chart on a shadowed card (analytics look)
 *  - 'card-title-in'  : title + chart together on one shadowed card */
export type StatsVariant = 'bare' | 'card-title-out' | 'card-title-in';
const CARD_CHROME = 'bg-card rounded-lg shadow-elevated py-3 px-5';

/** Card title rendered like the grid's outline section titles: Inter Black,
 *  uppercase, horizontally stretched (scaleX) to fill the card width — capped at
 *  the same MAX_LABEL_STRETCH the outlines use. */
function StretchTitle({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scaleX, setScaleX] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const avail = el.clientWidth;
      const fontPx = parseFloat(getComputedStyle(el).fontSize) || 14;
      const w = measureLabelWidth(text, fontPx);
      if (w > 0 && avail > 0) setScaleX(Math.min(MAX_LABEL_STRETCH, avail / w));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);
  return (
    <div ref={ref} className="text-sm mb-0.5 overflow-hidden">
      <span
        className="inline-block font-black uppercase leading-none whitespace-nowrap origin-left"
        style={{ transform: `scaleX(${scaleX})` }}
      >
        {text}
      </span>
    </div>
  );
}

function Card({ title, subtitle, children, variant }: { title: string; subtitle?: string; children: React.ReactNode; variant: StatsVariant }) {
  const titleEl = (
    <>
      <StretchTitle text={title} />
      {subtitle && <p className={`${STATS_TEXT} text-muted-foreground mb-2 leading-snug`}>{subtitle}</p>}
    </>
  );
  if (variant === 'card-title-in') {
    return (
      <section>
        <div className={CARD_CHROME}>
          {titleEl}
          {children}
        </div>
      </section>
    );
  }
  return (
    <section>
      {titleEl}
      <div className={variant === 'card-title-out' ? CARD_CHROME : ''}>{children}</div>
    </section>
  );
}

function HistogramLegend() {
  return (
    <div className="flex items-center gap-4 mb-2">
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
        <span className={`${STATS_TEXT} text-muted-foreground font-medium`}>National Dex</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
        <span className={`${STATS_TEXT} text-muted-foreground font-medium`}>Yours</span>
      </div>
    </div>
  );
}

/**
 * Read-only "detailed stats" for the current dex: type distribution, generation
 * origin, and base-stat-total distribution — the same charts as the Analytics
 * page, reused here without its drill-down interactivity. Data comes from the
 * live store (same dex the grid shows).
 */
export function DetailedStatsPanel({ className = '', variant = 'card-title-in', typeBadges = true, heights = DEFAULT_STATS_HEIGHTS }: { className?: string; variant?: StatsVariant; typeBadges?: boolean; heights?: { type: number; region: number; bst: number } }) {
  const sections = usePokedexStore((s) => s.sections);
  const analytics = useAnalytics(false);

  const typeRows = useMemo<ButterflyRow[]>(() => {
    const pokemon = getPokemonByIds(Object.values(sections).flat());
    const total = pokemon.length;
    if (total === 0) return [];
    const rows = buildTypeRows(countTypes(pokemon), total, fullBaseline.typeProp)
      .sort((a, b) => b.deviation - a.deviation);
    // Swap the small type symbol for the full type-name badge image when requested.
    return typeBadges
      ? rows.map((r) => ({ ...r, icon: typeBadgePath(r.label.toLowerCase() as TypeName) }))
      : rows;
  }, [sections, typeBadges]);

  // Both charts share this icon-column aspect so their bar columns stay aligned
  // even when the type chart's identifier is a wide name badge.
  const iconColAspect = typeBadges ? TYPE_BADGE_ASPECT : 1;

  const genRows = useMemo<ButterflyRow[]>(
    () =>
      analytics.generationDeviation.map((d, i) => {
        const gen = d.generation;
        const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
        return {
          label: `Gen ${gen}`,
          count: d.count,
          deviation: d.deviation,
          color: GEN_COLORS[i % GEN_COLORS.length],
          icon: (x: number, y: number, size: number) => {
            const gradId = `stats-gen-grad-${gen}`;
            const r = size / 2;
            return (
              <React.Fragment key={`stats-gen-${gen}`}>
                <defs>
                  <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
                    {stops.map((s, si) => (
                      <stop key={si} offset={s.offset} stopColor={s.color} />
                    ))}
                  </linearGradient>
                </defs>
                <circle cx={x + r} cy={y + r} r={r} fill={`url(#${gradId})`} />
                <text
                  x={x + r} y={y + r} textAnchor="middle" dominantBaseline="central"
                  fill="white" fontSize={size * 0.55} fontWeight="800"
                  fontFamily="system-ui, sans-serif"
                  paintOrder="stroke" stroke="rgba(0,0,0,0.4)" strokeWidth="1.5"
                >
                  {gen}
                </text>
              </React.Fragment>
            );
          },
        };
      }),
    [analytics.generationDeviation],
  );

  const bstHist = useMemo(
    () => alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram, 50, 100),
    [analytics.yourBstHistogram, analytics.nationalBstHistogram],
  );

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <Card variant={variant} title="Type Distribution" subtitle="Your types, and how they deviate from the national dex.">
        <ButterflyChart data={typeRows} rowHeight={16} hideLabelText labelHeader="TYPE" iconColAspect={iconColAspect} iconFillsRow={typeBadges} heightScale={heights.type} disableEmptyRows textClass={STATS_TEXT} />
      </Card>

      <Card variant={variant} title="Generation Origin" subtitle="Which generation your Pokémon come from, vs the national dex.">
        <ButterflyChart
          data={[...genRows].sort((a, b) => parseInt(a.label.replace('Gen ', '')) - parseInt(b.label.replace('Gen ', '')))}
          rowHeight={24}
          hideLabelText
          labelHeader="GEN"
          iconColAspect={iconColAspect}
          iconFillsRow={typeBadges}
          heightScale={heights.region}
          disableEmptyRows
          textClass={STATS_TEXT}
        />
      </Card>

      <Card variant={variant} title="Base Stat Total" subtitle={`Yours avg: ${analytics.bstStats.avg}, National avg: ${analytics.nationalAvgBst}.`}>
        <HistogramLegend />
        <SuperimposedHistogram
          data={bstHist.merged}
          binSize={bstHist.binSize}
          xDomain={bstHist.xDomain}
          xTicks={bstHist.xTicks}
          minorXTicks={bstHist.xTicks.slice(0, -1).map((t, i) => (t + bstHist.xTicks[i + 1]) / 2)}
          yDomain={bstHist.yDomain}
          yTicks={bstHist.yTicks}
          heightScale={heights.bst}
          textClass={STATS_TEXT}
        />
      </Card>
    </div>
  );
}
