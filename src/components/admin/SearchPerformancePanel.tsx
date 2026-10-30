import { useMemo, useState, type CSSProperties } from 'react';
import { Delta, Kpi, Panel, Seg } from '@/components/admin/ui';
import { cssVar, useECharts, type EChartsOption } from '@/components/admin/charts/useECharts';
import type {
  SearchPageEngineView,
  SearchPagePerformance,
  SearchPerformanceView,
  SearchProviderRangeView,
  SearchRangeComparison,
} from '@/lib/searchPerformanceView';
import type {
  SearchDateRange,
  SearchGranularity,
  SearchMetric,
  SearchProviderKey,
  SearchProviderStatus,
  SearchRangeKey,
  SearchSeriesPoint,
} from '@/lib/searchPerformance';
import { cn } from '@/lib/utils';

const PROVIDERS: { key: SearchProviderKey; label: string }[] = [
  { key: 'google', label: 'Google' },
  { key: 'bing', label: 'Bing' },
];

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: value >= 10_000 ? 'compact' : 'standard',
    maximumFractionDigits: 1,
  }).format(value);
}

function signed(value: number): string {
  return `${value > 0 ? '+' : ''}${compact(value)}`;
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function signedPercent(value: number): string {
  return `${value > 0 ? '+' : ''}${(value * 100).toFixed(0)}%`;
}

function position(value: number | null): string {
  return value == null ? '—' : value.toFixed(1);
}

function shortDate(value: string | undefined): string {
  if (!value) return '—';
  const day = value.length === 10;
  const parsed = Date.parse(day ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(
    undefined,
    day ? { month: 'short', day: 'numeric', timeZone: 'UTC' } : { month: 'short', day: 'numeric', hour: 'numeric' },
  ).format(parsed);
}

function rangeLabel(window: SearchDateRange | undefined): string {
  return window ? `${shortDate(window.start)}–${shortDate(window.end)}` : '—';
}

function statusLabel(status: SearchProviderStatus): string {
  if (status === 'not_configured') return 'not connected';
  return status;
}

function statusDot(status: SearchProviderStatus): string {
  if (status === 'ready') return 'bg-emerald-500';
  if (status === 'stale') return 'bg-amber-500';
  return 'bg-muted-foreground/50';
}

function countDelta(comparison: SearchRangeComparison | null, metric: 'clicks' | 'impressions'): string[] {
  if (!comparison) return ['—'];
  const absolute = comparison.delta[metric];
  const relative = comparison.delta[`${metric}Pct`];
  return relative == null ? [signed(absolute)] : [signed(absolute), signedPercent(relative)];
}

type SearchKpiKey = 'clicks' | 'impressions' | 'ctr' | 'position';

interface SearchKpi {
  key: SearchKpiKey;
  label: string;
  unit: string;
  color: string;
  emphasis?: boolean;
  inverse?: boolean;
  /** Smallest gap between axis ticks, so whole-number metrics get whole-number ticks. */
  minInterval?: number;
  pick: (metric: SearchMetric) => number | null;
  format: (value: number) => string;
  axis: (value: number) => string;
  /** The change from the previous period, one part per line. */
  delta: (comparison: SearchRangeComparison | null) => string[];
}

const SEARCH_KPIS: SearchKpi[] = [
  {
    key: 'clicks',
    label: 'Clicks',
    unit: 'clicks',
    minInterval: 1,
    color: '#4285F4',
    emphasis: true,
    pick: (m) => m.clicks,
    format: compact,
    axis: compact,
    delta: (c) => countDelta(c, 'clicks'),
  },
  {
    key: 'impressions',
    label: 'Impressions',
    unit: 'impr.',
    minInterval: 1,
    color: '#5E35B1',
    pick: (m) => m.impressions,
    format: compact,
    axis: compact,
    delta: (c) => countDelta(c, 'impressions'),
  },
  {
    key: 'ctr',
    label: 'CTR',
    unit: 'CTR',
    color: '#00897B',
    pick: (m) => m.ctr,
    format: percent,
    axis: (value) => `${+(value * 100).toFixed(1)}%`,
    delta: (c) => [c ? `${c.delta.ctrPoints > 0 ? '+' : ''}${(c.delta.ctrPoints * 100).toFixed(2)}pt` : '—'],
  },
  {
    key: 'position',
    label: 'Position',
    unit: 'pos.',
    minInterval: 1,
    color: '#E8710A',
    inverse: true,
    pick: (m) => m.position,
    format: position,
    axis: (value) => String(+value.toFixed(1)),
    delta: (c) =>
      [c?.delta.position != null ? `${c.delta.position > 0 ? '+' : ''}${c.delta.position.toFixed(1)}` : '—'],
  },
];

const DEFAULT_KPIS: SearchKpiKey[] = ['clicks', 'impressions'];

function shown(kpi: SearchKpi, value: number | null): string {
  return value == null ? '—' : kpi.format(value);
}

/** Search Console labels its axes only while one or two metrics are on. */
const MAX_LABELED_AXES = 2;

function SearchTrend({
  series: final,
  fresh,
  granularity,
  kpis,
}: {
  series: SearchSeriesPoint[];
  fresh: SearchSeriesPoint[];
  granularity: SearchGranularity;
  kpis: SearchKpi[];
}) {
  const rows = useMemo(() => [...final, ...fresh], [final, fresh]);
  const { lines, scrubLabel, build } = useMemo(() => {
    const lastFinal = final.length - 1;
    const lines = kpis.map((kpi) => ({ kpi, values: rows.map(kpi.pick) }));
    const drawn = lines.filter((line) => line.values.some((value) => value != null));
    const labeled = drawn.length <= MAX_LABELED_AXES;
    const scrubLabel = (i: number) => [
      i > lastFinal ? `${shortDate(rows[i].start)} · not final` : shortDate(rows[i].start),
      ...lines.map(({ kpi, values }) => `<b>${shown(kpi, values[i])}</b> ${kpi.unit}`),
    ];
    const build = (el: HTMLDivElement): EChartsOption => {
      const scale = Math.max(1, Math.min(el.clientWidth / 360, 2));
      const font = Math.round(0.65 * (parseFloat(getComputedStyle(document.documentElement).fontSize) || 16));
      const faint = cssVar(el, '--color-muted-foreground', '#737373');
      const gridLine = cssVar(el, '--color-muted', '#f5f5f5');
      const last = rows.length - 1;
      return {
        animation: false,
        grid: { left: 2, right: 2, top: Math.max(28, font * 2.5), bottom: 2, containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((row) => row.start),
          boundaryGap: false,
          axisLine: { lineStyle: { color: cssVar(el, '--color-border', '#e5e5e5') } },
          axisTick: { show: false },
          axisLabel: {
            color: faint,
            fontSize: font,
            fontWeight: 600,
            interval: (i: number) => i === 0 || i === last,
            alignMinLabel: 'left',
            alignMaxLabel: 'right',
            formatter: (value: string) => shortDate(value),
          },
        },
        yAxis: drawn.length
          ? drawn.map(({ kpi }, i) => {
              const bounds = kpi.inverse ? { inverse: true, min: 1 } : { min: 0 };
              // containLabel still reserves room for a hidden axis's labels, so hide them too.
              if (!labeled) {
                return { type: 'value' as const, ...bounds, max: 'dataMax', show: false, axisLabel: { show: false } };
              }
              const side = i === 0 ? 'left' : 'right';
              return {
                type: 'value' as const,
                ...bounds,
                position: side,
                alignTicks: i > 0,
                splitNumber: 3,
                minInterval: kpi.minInterval,
                name: kpi.label,
                // An inverted axis starts at the top.
                nameLocation: kpi.inverse ? ('start' as const) : ('end' as const),
                nameGap: font,
                nameTextStyle: { color: kpi.color, fontSize: font, fontWeight: 700, align: side },
                axisLabel: { color: faint, fontSize: font, formatter: kpi.axis },
                splitLine: { show: i === 0, lineStyle: { color: gridLine, width: 1 } },
              };
            })
          : { type: 'value', show: false },
        series: drawn.flatMap(({ kpi, values }, i) => {
          const line = (data: (number | null)[], dotted: boolean) => ({
            name: kpi.key,
            type: 'line' as const,
            yAxisIndex: i,
            data,
            symbol: 'none',
            lineStyle: { color: kpi.color, width: 1.5 * scale, type: dotted ? ('dotted' as const) : ('solid' as const) },
            itemStyle: { color: kpi.color },
          });
          if (lastFinal >= last) return [line(values, false)];
          return [
            line(values.map((value, j) => (j <= lastFinal ? value : null)), false),
            line(values.map((value, j) => (j >= lastFinal ? value : null)), true),
          ];
        }),
      };
    };
    return { lines, scrubLabel, build };
  }, [rows, final.length, kpis]);
  const ref = useECharts(build, { scrub: { count: rows.length, label: scrubLabel } });

  if (rows.length < 2 || rows.every((row) => row.impressions === 0)) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div
        ref={ref}
        className="aspect-[3/1] max-h-[240px] min-h-[120px] w-full"
        role="img"
        aria-label={`${granularity === 'hour' ? 'Hourly' : 'Daily'} ${lines.map(({ kpi }) => kpi.label).join(', ')} from ${shortDate(rows[0].start)} to ${shortDate(rows[rows.length - 1].start)}.`}
      />
      {fresh.length > 0 && (
        <p className="mt-1 flex items-center gap-1.5 text-[0.65rem] font-semibold text-muted-foreground">
          <span aria-hidden className="w-4 border-t-2 border-dotted border-muted-foreground" />
          Not final yet: {fresh.length === 1
            ? shortDate(fresh[0].start)
            : rangeLabel({ start: fresh[0].start, end: fresh[fresh.length - 1].start })}
        </p>
      )}
    </div>
  );
}

function KpiToggle({
  kpi,
  metric,
  comparison,
  on,
  onToggle,
}: {
  kpi: SearchKpi;
  metric: SearchMetric | null;
  comparison: SearchRangeComparison | null;
  on: boolean;
  onToggle: () => void;
}) {
  const fill = {
    backgroundColor: kpi.color,
    color: '#ffffff',
    '--color-muted-foreground': '#ffffff',
    '--color-muted': 'rgb(255 255 255 / 0.2)',
  } as CSSProperties;
  return (
    <button
      type="button"
      data-kpi={kpi.key}
      aria-pressed={on}
      onClick={onToggle}
      className={cn('rounded-lg p-2.5 text-left transition-colors max-md:flex max-md:flex-col', !on && 'hover:bg-muted/60')}
      style={on ? fill : undefined}
    >
      <Kpi
        emphasis={kpi.emphasis}
        value={metric ? shown(kpi, kpi.pick(metric)) : '—'}
        label={kpi.label}
        delta={<Delta parts={kpi.delta(comparison)} />}
      />
    </button>
  );
}

function QueryRows({ rows }: { rows: SearchProviderRangeView['topQueries'] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 grid grid-cols-[minmax(0,1fr)_repeat(4,auto)] gap-x-2 border-t border-border pt-3">
      <div className="col-span-full grid grid-cols-subgrid border-b border-border pb-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Query</span>
        <span className="text-right">Clicks</span>
        <span className="text-right">Impr.</span>
        <span className="text-right">CTR</span>
        <span className="text-right">Pos.</span>
      </div>
      {rows.slice(0, 8).map((row) => (
        <div key={row.key} className="col-span-full grid grid-cols-subgrid items-baseline border-b border-border/60 py-1.5 text-xs last:border-b-0">
          <span className="min-w-0 break-words">{row.key}</span>
          <span className="text-right font-bold tabular-nums">{compact(row.clicks)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{compact(row.impressions)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{percent(row.ctr)}</span>
          <span className="text-right tabular-nums text-muted-foreground">{position(row.position)}</span>
        </div>
      ))}
    </div>
  );
}

function EngineRow({ provider, engine }: { provider: string; engine: SearchPageEngineView }) {
  const metric = engine.current;
  if (!metric) return null;
  const direction = engine.direction;
  return (
    <div className="grid grid-cols-[3.5rem_repeat(4,minmax(0,1fr))] items-end gap-1.5 border-t border-border py-2 first:border-t-0 sm:grid-cols-[4rem_repeat(4,minmax(0,1fr))] sm:gap-2">
      <span className="self-center text-xs font-bold">{provider}</span>
      <PageMetric label="Clicks" value={compact(metric.clicks)} />
      <PageMetric
        label="Impr."
        value={compact(metric.impressions)}
        delta={direction ? `${signed(direction.impressions)} prev.` : undefined}
      />
      <PageMetric label="CTR" value={percent(metric.ctr)} />
      <PageMetric label="Position" value={position(metric.position)} />
    </div>
  );
}

function PageMetric({ label, value, delta }: { label: string; value: string; delta?: string }) {
  return (
    <div className="min-w-0 text-right">
      <p className="truncate text-xs font-bold tabular-nums">{value}</p>
      <p className="text-[0.58rem] text-muted-foreground">{label}</p>
      {delta && <p className="truncate text-[0.58rem] tabular-nums text-muted-foreground">{delta}</p>}
    </div>
  );
}

function PageRow({ page }: { page: SearchPagePerformance }) {
  return (
    <article
      data-testid={`search-page-${page.path === '/' ? 'home' : page.path.slice(1).replace(/\//g, '-')}`}
      className="border-t border-border py-3 first:border-t-0 first:pt-0"
    >
      <div className="mb-1 flex min-w-0 items-baseline justify-between gap-3">
        <h3 className="max-w-full shrink-0 truncate text-sm font-bold">{page.label}</h3>
        <span className="min-w-0 truncate font-mono text-[0.65rem] text-muted-foreground" title={page.path}>{page.path}</span>
      </div>
      <EngineRow provider="Google" engine={page.engines.google} />
      <EngineRow provider="Bing" engine={page.engines.bing} />
      {page.topQueries.length > 0 && (
        <div className="border-t border-border pt-2">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 text-[0.65rem] text-muted-foreground">
            <span className="font-bold uppercase tracking-wide">Google query</span>
            <span className="text-right font-bold uppercase tracking-wide">Clicks</span>
            <span className="text-right font-bold uppercase tracking-wide">Impr.</span>
          </div>
          {page.topQueries.slice(0, 3).map((query) => (
            <div key={`${query.provider}:${query.query}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 py-1 text-xs">
              <span className="truncate" title={query.query}>{query.query}</span>
              <span className="min-w-8 text-right font-bold tabular-nums">{compact(query.clicks)}</span>
              <span className="min-w-8 text-right tabular-nums text-muted-foreground">{compact(query.impressions)}</span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function SearchPerformancePanel({
  snapshot,
  loading,
  error,
  range,
}: {
  snapshot: SearchPerformanceView | null;
  loading: boolean;
  error: string | null;
  range: SearchRangeKey;
}) {
  const [provider, setProvider] = useState<SearchProviderKey>('google');
  const [picked, setPicked] = useState<SearchKpiKey[]>(DEFAULT_KPIS);
  const kpis = useMemo(() => SEARCH_KPIS.filter((kpi) => picked.includes(kpi.key)), [picked]);
  const toggleKpi = (key: SearchKpiKey) =>
    setPicked((cur) => (cur.includes(key) ? (cur.length > 1 ? cur.filter((k) => k !== key) : cur) : [...cur, key]));
  const view = snapshot?.byRange[range] ?? null;
  const selected = view?.providers[provider] ?? null;
  const statusLegend = view ? (
    <span className="flex items-center gap-2.5">
      {PROVIDERS.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={cn('size-1.5 rounded-full', statusDot(view.providers[key].status))} />
          {label} {statusLabel(view.providers[key].status)}
        </span>
      ))}
    </span>
  ) : undefined;

  return (
    <div data-testid="search-performance" className="grid gap-4">
      <Panel
        title="Overview"
        legend={statusLegend}
        actions={<Seg ariaLabel="Search provider" options={PROVIDERS} value={provider} onChange={setProvider} />}
      >
        {!snapshot && loading && <p className="py-8 text-sm text-muted-foreground">Loading…</p>}
        {!snapshot && error && <p className="py-3 text-sm text-destructive">{error}</p>}
        {view && selected && (
          <>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] font-semibold text-muted-foreground">
              <span>Current {rangeLabel(selected.current?.window)}</span>
              <span>Previous {rangeLabel(selected.comparison?.previous.window)}</span>
              <span>Through {shortDate(selected.dataThrough)}</span>
            </div>
            <div className="-mx-2.5 grid grid-cols-2 gap-1 md:grid-cols-4">
              {SEARCH_KPIS.map((kpi) => (
                <KpiToggle
                  key={kpi.key}
                  kpi={kpi}
                  metric={selected.current?.metric ?? null}
                  comparison={selected.comparison}
                  on={kpis.includes(kpi)}
                  onToggle={() => toggleKpi(kpi.key)}
                />
              ))}
            </div>
            <SearchTrend series={selected.series} fresh={selected.fresh} granularity={view.granularity} kpis={kpis} />
            <QueryRows rows={selected.topQueries} />
          </>
        )}
      </Panel>

      <Panel title="Pages">
        {view && view.pages.length > 0
          ? view.pages.map((page) => <PageRow key={page.path} page={page} />)
          : <p className="py-4 text-sm text-muted-foreground">No page data.</p>}
      </Panel>
    </div>
  );
}
