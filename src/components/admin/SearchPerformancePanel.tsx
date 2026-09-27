import { useState } from 'react';
import { Delta, Kpi, Panel, Seg } from '@/components/admin/ui';
import type {
  SearchPageEngineView,
  SearchPerformanceView,
  SearchPeriodComparison,
} from '@/lib/searchPerformanceView';
import type { SearchDailyPoint, SearchProviderKey, SearchProviderStatus } from '@/lib/searchPerformance';
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

function MetricDelta({ comparison, metric }: {
  comparison: SearchPeriodComparison;
  metric: 'clicks' | 'impressions';
}) {
  if (!comparison.available) return <Delta>—</Delta>;
  const absolute = comparison.delta[metric];
  const relative = comparison.delta[`${metric}Pct`];
  return <Delta>{relative == null ? signed(absolute) : `${signed(absolute)} · ${signedPercent(relative)}`}</Delta>;
}

function SearchTrend({ daily }: { daily: SearchDailyPoint[] }) {
  const rows = daily.slice(-28);
  const values = rows.map((row) => row.impressions);
  const high = Math.max(1, ...values);
  const width = 100;
  const height = 30;
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - (value / high) * (height - 3) - 1.5;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  if (rows.length < 2 || values.every((value) => value === 0)) return null;
  return (
    <div className="mt-4 border-t border-border pt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-20 w-full overflow-visible text-primary"
        role="img"
        aria-label={`Daily impressions for the latest ${rows.length} reported days.`}
      >
        <line x1="0" y1={height - 1} x2={width} y2={height - 1} stroke="var(--color-border)" strokeWidth="0.5" />
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="-mt-1 flex justify-between text-[0.65rem] font-semibold text-muted-foreground">
        <span>{shortDate(rows[0]?.date)}</span>
        <span>Daily impressions</span>
        <span>{shortDate(rows[rows.length - 1]?.date)}</span>
      </div>
    </div>
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
}: {
  snapshot: SearchPerformanceView | null;
  loading: boolean;
  error: string | null;
}) {
  const [provider, setProvider] = useState<SearchProviderKey>('google');
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
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
              <Kpi
                emphasis
                value={compact(comparison.current.metric.clicks)}
                label="Clicks"
                delta={<MetricDelta comparison={comparison} metric="clicks" />}
              />
              <Kpi
                value={compact(comparison.current.metric.impressions)}
                label="Impressions"
                delta={<MetricDelta comparison={comparison} metric="impressions" />}
              />
              <Kpi
                value={percent(comparison.current.metric.ctr)}
                label="CTR"
                delta={<Delta>{comparison.available ? `${comparison.delta.ctrPoints > 0 ? '+' : ''}${(comparison.delta.ctrPoints * 100).toFixed(2)}pt` : '—'}</Delta>}
              />
              <Kpi
                value={position(comparison.current.metric.position)}
                label="Position"
                delta={<Delta>{comparison.available && comparison.delta.position != null ? `${comparison.delta.position > 0 ? '+' : ''}${comparison.delta.position.toFixed(1)}` : '—'}</Delta>}
              />
            </div>
            <SearchTrend daily={selected.daily} />
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
