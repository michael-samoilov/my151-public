import { useMemo, useRef, useState, useLayoutEffect } from 'react';
import React from 'react';
import { measureLabelWidth, MAX_LABEL_STRETCH } from '@/lib/sectionOutlines';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useAnalytics, fullBaseline } from '@/hooks/useAnalytics';
import { getPokemonByIds } from '@/hooks/usePokemonData';
import { countTypes, buildTypeRows } from '@/components/analytics/typeDistribution';
import { ButterflyChart } from '@/components/analytics/ButterflyChart';
import { CHART_BAR_RED, rowKey, type ButterflyRow } from '@/components/analytics/butterflyRow';
import { t, useT } from '@/i18n';
import { SuperimposedHistogram } from '@/components/analytics/SuperimposedHistogram';
import { generationChartIcon } from '@/components/shared/attributeBadgeSvg';
import type { GenNumber } from '@/favorites/model/cells';
import { typeChartIcon } from '@/components/shared/typeBadgeSvg';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import type { TypeName } from '@/types/pokemon';

const STATS_TEXT = 'text-[0.625rem]';

export const STATS_MIN_POKEMON = 100;

export const DEFAULT_STATS_HEIGHTS = { type: 1.2, region: 0.6, bst: 0.7 };

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

type StatsVariant = 'bare' | 'card-title-out' | 'card-title-in';
const CARD_CHROME = 'bg-card rounded-lg shadow-elevated py-3 px-5';

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
        <span className={`${STATS_TEXT} text-muted-foreground font-medium`}>{t('stats.legend.national')}</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
        <span className={`${STATS_TEXT} text-muted-foreground font-medium`}>{t('stats.legend.yours')}</span>
      </div>
    </div>
  );
}

export function DetailedStatsPanel({ className = '', variant = 'card-title-in', typeBadges = true, heights = DEFAULT_STATS_HEIGHTS }: { className?: string; variant?: StatsVariant; typeBadges?: boolean; heights?: { type: number; region: number; bst: number } }) {
  const sections = usePokedexStore((s) => s.sections);
  const analytics = useAnalytics(false);

  const typeRows = useMemo<ButterflyRow[]>(() => {
    const pokemon = getPokemonByIds(Object.values(sections).flat());
    const total = pokemon.length;
    if (total === 0) return [];
    const rows = buildTypeRows(countTypes(pokemon), total, fullBaseline.typeProp)
      .sort((a, b) => b.deviation - a.deviation);
    return typeBadges
      ? rows.map((r) => ({ ...r, icon: typeChartIcon(rowKey(r) as TypeName) }))
      : rows;
  }, [sections, typeBadges]);

  const iconColAspect = typeBadges ? TYPE_BADGE_ASPECT : 1;

  const tr = useT();
  const genRows = useMemo<ButterflyRow[]>(
    () =>
      analytics.generationDeviation.map((d) => {
        const gen = d.generation;
        return {
          key: String(gen),
          label: tr('browser.genChip', { gen }),
          count: d.count,
          deviation: d.deviation,
          color: CHART_BAR_RED,
          icon: generationChartIcon(gen as GenNumber),
        };
      }),
    [analytics.generationDeviation, tr],
  );

  const bstHist = useMemo(
    () => alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram, 50, 100),
    [analytics.yourBstHistogram, analytics.nationalBstHistogram],
  );

  return (
    <div className={`flex flex-col gap-4 ${className}`}>
      <Card variant={variant} title={t('stats.type.title')}>
        <ButterflyChart alignBaselines data={typeRows} rowHeight={16} hideLabelText labelHeader={t('chart.header.type')} iconColAspect={iconColAspect} iconFillsRow={typeBadges} heightScale={heights.type} disableEmptyRows textClass={STATS_TEXT} />
      </Card>

      <Card variant={variant} title={t('stats.gen.title')}>
        <ButterflyChart
          alignBaselines
          data={[...genRows].sort((a, b) => Number(rowKey(a)) - Number(rowKey(b)))}
          rowHeight={24}
          hideLabelText
          labelHeader={t('chart.header.gen')}
          iconColAspect={iconColAspect}
          iconFillsRow={typeBadges}
          heightScale={heights.region}
          disableEmptyRows
          textClass={STATS_TEXT}
        />
      </Card>

      <Card variant={variant} title={t('stats.bst.title')} subtitle={t('analytics.avgCompare', { yours: analytics.bstStats.avg, national: analytics.nationalAvgBst })}>
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
