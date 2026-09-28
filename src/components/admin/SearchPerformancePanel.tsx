import { useMemo, useState, type CSSProperties } from 'react';
import { Delta, Kpi, Panel, Seg } from '@/components/admin/ui';
import { rangeStart, type DashboardRange } from '../../../api/_range';
import { cssVar, useECharts, type EChartsOption } from '@/components/admin/charts/useECharts';
import type {
  SearchPageEngineView,
  SearchPerformanceView,
  SearchPeriodComparison,
} from '@/lib/searchPerformanceView';
import type { SearchDailyPoint, SearchMetric, SearchProviderKey, SearchProviderStatus } from '@/lib/searchPerformance';
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
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
}

function rangeLabel(start: string, end: string): string {
  if (!start || !end) return '—';
  return `${shortDate(start)}–${shortDate(end)}`;
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

function countDelta(comparison: SearchPeriodComparison, metric: 'clicks' | 'impressions'): string {
  if (!comparison.available) return '—';
  const absolute = comparison.delta[metric];
  const relative = comparison.delta[`${metric}Pct`];
  return relative == null ? signed(absolute) : `${signed(absolute)} · ${signedPercent(relative)}`;
}

type SearchKpiKey = 'clicks' | 'impressions' | 'ctr' | 'position';

/** One Search Console metric: its tile, its line, and its readout part. */
interface SearchKpi {
  key: SearchKpiKey;
  label: string;
  /** The word after the value in the scrub readout. */
  unit: string;
  /** Search Console's color for the metric, on its line and its selected tile. */
  color: string;
  emphasis?: boolean;
  /** Lower is better, so the scale runs down from 1 at the top, as in Search Console. */
  inverse?: boolean;
  pick: (metric: SearchMetric) => number | null;
  format: (value: number) => string;
  delta: (comparison: SearchPeriodComparison) => string;
}

const SEARCH_KPIS: SearchKpi[] = [
  {
    key: 'clicks',
    label: 'Clicks',
    unit: 'clicks',
    color: '#4285F4',
    emphasis: true,
    pick: (m) => m.clicks,
    format: compact,
    delta: (c) => countDelta(c, 'clicks'),
  },
  {
    key: 'impressions',
    label: 'Impressions',
    unit: 'impr.',
    color: '#5E35B1',
    pick: (m) => m.impressions,
    format: compact,
    delta: (c) => countDelta(c, 'impressions'),
  },
  {
    key: 'ctr',
    label: 'CTR',
    unit: 'CTR',
    color: '#00897B',
    pick: (m) => m.ctr,
    format: percent,
    delta: (c) => (c.available ? `${c.delta.ctrPoints > 0 ? '+' : ''}${(c.delta.ctrPoints * 100).toFixed(2)}pt` : '—'),
  },
  {
    key: 'position',
    label: 'Position',
    unit: 'pos.',
    color: '#E8710A',
    inverse: true,
    pick: (m) => m.position,
    format: position,
    delta: (c) =>
      c.available && c.delta.position != null ? `${c.delta.position > 0 ? '+' : ''}${c.delta.position.toFixed(1)}` : '—',
  },
];

/** Search Console opens the chart on these two. */
const DEFAULT_KPIS: SearchKpiKey[] = ['clicks', 'impressions'];

function shown(kpi: SearchKpi, value: number | null): string {
  return value == null ? '—' : kpi.format(value);
}

const DAY_MS = 86_400_000;

/** Rows inside `range`, counted back from the latest reported day. */
function windowRows(daily: SearchDailyPoint[], range: DashboardRange): SearchDailyPoint[] {
  const last = daily[daily.length - 1];
  const start = last ? rangeStart(range, Date.parse(`${last.date}T00:00:00Z`) + DAY_MS) : null;
  if (start === null) return daily;
  return daily.filter((row) => Date.parse(`${row.date}T00:00:00Z`) >= start);
}

function SearchTrend({ daily, range, kpis }: { daily: SearchDailyPoint[]; range: DashboardRange; kpis: SearchKpi[] }) {
  const rows = windowRows(daily, range);
  const lines = kpis.map((kpi) => ({ kpi, values: rows.map(kpi.pick) }));
  const drawn = lines.filter((line) => line.values.some((value) => value != null));
  const scrubLabel = (i: number) => [
    shortDate(rows[i].date),
    ...lines.map(({ kpi, values }) => `<b>${shown(kpi, values[i])}</b> ${kpi.unit}`),
  ];
  const ref = useECharts(
    (el): EChartsOption => {
      const scale = Math.max(1, Math.min(el.clientWidth / 360, 2));
      return {
        animation: false,
        // The top band holds the scrub readout, so it never covers a line.
        grid: { left: 2, right: 2, top: 28, bottom: 1 },
        xAxis: {
          type: 'category',
          data: rows.map((row) => row.date),
          boundaryGap: false,
          axisLine: { lineStyle: { color: cssVar(el, '--color-border', '#e5e5e5') } },
          axisTick: { show: false },
          axisLabel: { show: false },
        },
        // One hidden scale per metric, as Search Console draws them.
        yAxis: drawn.length
          ? drawn.map(({ kpi }) =>
              kpi.inverse
                ? { type: 'value' as const, inverse: true, min: 1, max: 'dataMax', show: false }
                : { type: 'value' as const, min: 0, max: 'dataMax', show: false },
            )
          : { type: 'value', show: false },
        series: drawn.map(({ kpi, values }, i) => ({
          name: kpi.key,
          type: 'line' as const,
          yAxisIndex: i,
          data: values,
          symbol: 'none',
          lineStyle: { color: kpi.color, width: 1.5 * scale },
          itemStyle: { color: kpi.color },
        })),
      };
    },
    [daily, range, kpis],
    { scrub: { count: rows.length, label: scrubLabel } },
  );

  if (rows.length < 2 || rows.every((row) => row.impressions === 0)) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div
        ref={ref}
        className="aspect-[3/1] max-h-[240px] min-h-[120px] w-full"
        role="img"
        aria-label={`Daily ${lines.map(({ kpi }) => kpi.label).join(', ')} for the latest ${rows.length} reported days.`}
      />
      <div className="mt-1 flex justify-between text-[0.65rem] font-semibold text-muted-foreground">
        <span>{shortDate(rows[0]?.date)}</span>
        <span>{shortDate(rows[rows.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

/** A KPI tile that toggles its line. Selected, it fills with the line color. */
function KpiToggle({
  kpi,
  comparison,
  on,
  onToggle,
}: {
  kpi: SearchKpi;
  comparison: SearchPeriodComparison;
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
      className={cn('rounded-lg p-2.5 text-left transition-colors', !on && 'hover:bg-muted/60')}
      style={on ? fill : undefined}
    >
      <Kpi
        emphasis={kpi.emphasis}
        value={shown(kpi, kpi.pick(comparison.current.metric))}
        label={kpi.label}
        delta={<Delta>{kpi.delta(comparison)}</Delta>}
      />
    </button>
  );
}

function QueryRows({ rows }: { rows: SearchPerformanceView['providers'][SearchProviderKey]['topQueries'] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-b border-border pb-1.5 text-[0.62rem] font-bold uppercase tracking-wide text-muted-foreground">
        <span>Query</span>
        <span className="text-right">Clicks</span>
        <span className="text-right">Impr.</span>
        <span className="text-right">Pos.</span>
      </div>
      {rows.slice(0, 8).map((row) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b border-border/60 py-1.5 text-xs last:border-b-0">
          <span className="truncate" title={row.key}>{row.key}</span>
          <span className="min-w-8 text-right font-bold tabular-nums">{compact(row.clicks)}</span>
          <span className="min-w-8 text-right tabular-nums text-muted-foreground">{compact(row.impressions)}</span>
          <span className="min-w-8 text-right tabular-nums text-muted-foreground">{position(row.position)}</span>
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

function PageRow({ page }: { page: SearchPerformanceView['pages'][number] }) {
  return (
    <article
      data-testid={`search-page-${page.path === '/' ? 'home' : page.path.slice(1).replace(/\//g, '-')}`}
      className="border-t border-border py-3 first:border-t-0 first:pt-0"
    >
      <div className="mb-1 flex min-w-0 items-baseline justify-between gap-3">
        <h3 className="truncate text-sm font-bold">{page.label}</h3>
        <span className="shrink-0 font-mono text-[0.65rem] text-muted-foreground">{page.path}</span>
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
  range: DashboardRange;
}) {
  const [provider, setProvider] = useState<SearchProviderKey>('google');
  const [picked, setPicked] = useState<SearchKpiKey[]>(DEFAULT_KPIS);
  const kpis = useMemo(() => SEARCH_KPIS.filter((kpi) => picked.includes(kpi.key)), [picked]);
  // At least one metric stays on the chart.
  const toggleKpi = (key: SearchKpiKey) =>
    setPicked((cur) => (cur.includes(key) ? (cur.length > 1 ? cur.filter((k) => k !== key) : cur) : [...cur, key]));
  const selected = snapshot?.providers[provider] ?? null;
  const comparison = selected?.comparison ?? null;
  const statusLegend = snapshot ? (
    <span className="flex items-center gap-2.5">
      {PROVIDERS.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span className={cn('size-1.5 rounded-full', statusDot(snapshot.providers[key].status))} />
          {label} {statusLabel(snapshot.providers[key].status)}
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
        {selected && comparison && (
          <>
            <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-[0.68rem] font-semibold text-muted-foreground">
              <span>Current {rangeLabel(comparison.current.range.start, comparison.current.range.end)}</span>
              <span>Previous {rangeLabel(comparison.previous.range.start, comparison.previous.range.end)}</span>
              <span>Through {shortDate(selected.dataThrough)}</span>
            </div>
            <div className="-mx-2.5 grid grid-cols-2 gap-1 md:grid-cols-4">
              {SEARCH_KPIS.map((kpi) => (
                <KpiToggle
                  key={kpi.key}
                  kpi={kpi}
                  comparison={comparison}
                  on={kpis.includes(kpi)}
                  onToggle={() => toggleKpi(kpi.key)}
                />
              ))}
            </div>
            <SearchTrend daily={selected.daily} range={range} kpis={kpis} />
            <QueryRows rows={selected.topQueries} />
          </>
        )}
      </Panel>

      <Panel title="Pages" sub={['28d']}>
        {snapshot && snapshot.pages.length > 0
          ? snapshot.pages.map((page) => <PageRow key={page.path} page={page} />)
          : <p className="py-4 text-sm text-muted-foreground">No page data.</p>}
      </Panel>
    </div>
  );
}
