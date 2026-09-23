import { useMemo, useState } from 'react';
import { Kpi, Panel, Seg } from '@/components/admin/ui';
import { cn } from '@/lib/utils';
import {
  summarizeSearchWindow,
  type SearchDailyPoint,
  type SearchDimensionRow,
  type SearchPerformanceSnapshot,
  type SearchProviderKey,
} from '@/lib/searchPerformance';

const PROVIDERS: { key: SearchProviderKey; label: string }[] = [
  { key: 'google', label: 'Google' },
  { key: 'bing', label: 'Bing' },
];

const RANGES: { key: '7' | '28' | '90'; label: string }[] = [
  { key: '7', label: '7d' },
  { key: '28', label: '28d' },
  { key: '90', label: '90d' },
];

function compact(value: number): string {
  return new Intl.NumberFormat(undefined, { notation: value >= 10_000 ? 'compact' : 'standard', maximumFractionDigits: 1 }).format(value);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function position(value: number | null): string {
  return value == null ? '—' : value.toFixed(1);
}

function shortDate(value: string | undefined): string {
  if (!value) return 'not yet';
  const parsed = Date.parse(`${value.length === 10 ? `${value}T00:00:00Z` : value}`);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(parsed);
}

function pageLabel(value: string): string {
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || '/';
  } catch {
    return value;
  }
}

function statusLabel(status: string): string {
  if (status === 'not_configured') return 'not connected';
  return status;
}

function SearchTrend({ daily, days }: { daily: SearchDailyPoint[]; days: number }) {
  const rows = daily.slice(-days);
  const values = rows.map((row) => row.impressions);
  const high = Math.max(1, ...values);
  const width = 100;
  const height = 32;
  const points = values
    .map((value, index) => {
      const x = values.length <= 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - (value / high) * (height - 3) - 1.5;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const total = values.reduce((sum, value) => sum + value, 0);

  if (rows.length < 2 || total === 0) {
    return <p className="py-6 text-xs text-muted-foreground">No impressions in this window yet.</p>;
  }
  return (
    <div className="mt-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-24 w-full overflow-visible text-primary"
        role="img"
        aria-label={`Daily search impressions over ${rows.length} reported days, from ${Math.min(...values)} to ${high}.`}
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
        <span>daily impressions</span>
        <span>{shortDate(rows[rows.length - 1]?.date)}</span>
      </div>
    </div>
  );
}

function DetailRows({ title, rows, kind }: { title: string; rows: SearchDimensionRow[]; kind: 'page' | 'query' }) {
  const visible = rows.slice(0, 5);
  return (
    <div className="min-w-0">
      <div className="mb-1.5 grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 border-b border-border pb-1 text-[0.65rem] font-bold uppercase tracking-wide text-muted-foreground">
        <span>{title}</span>
        <span>Clicks</span>
        <span>Views</span>
      </div>
      {visible.length === 0 ? (
        <p className="py-2 text-xs text-muted-foreground">No {title.toLowerCase()} reported yet.</p>
      ) : (
        <div className="flex flex-col gap-1.5">
          {visible.map((row) => (
            <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-2 text-xs">
              <span className="truncate" title={row.key}>{kind === 'page' ? pageLabel(row.key) : row.key}</span>
              <span className="min-w-8 text-right font-bold tabular-nums">{compact(row.clicks)}</span>
              <span className="min-w-8 text-right tabular-nums text-muted-foreground">{compact(row.impressions)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function SearchPerformancePanel({
  snapshot,
  loading,
  error,
}: {
  snapshot: SearchPerformanceSnapshot | null;
  loading: boolean;
  error: string | null;
}) {
  const [provider, setProvider] = useState<SearchProviderKey>('google');
  const [range, setRange] = useState<'7' | '28' | '90'>('28');

  const selected = snapshot?.providers[provider] ?? null;
  const metric = useMemo(
    () => summarizeSearchWindow(selected?.daily ?? [], Number(range)),
    [range, selected?.daily],
  );
  const statusLegend = snapshot ? (
    <span className="flex items-center gap-2">
      {PROVIDERS.map(({ key, label }) => (
        <span key={key} className="inline-flex items-center gap-1">
          <span
            className={cn(
              'size-1.5 rounded-full',
              snapshot.providers[key].status === 'ready'
                ? 'bg-emerald-500'
                : snapshot.providers[key].status === 'stale'
                  ? 'bg-amber-500'
                  : 'bg-muted-foreground/50',
            )}
          />
          {label} {statusLabel(snapshot.providers[key].status)}
        </span>
      ))}
    </span>
  ) : undefined;

  return (
    <Panel
      title="Search performance"
      legend={statusLegend}
      actions={<Seg ariaLabel="Search provider" options={PROVIDERS} value={provider} onChange={setProvider} />}
      className="overflow-hidden"
    >
      {!snapshot && loading && <p className="py-8 text-sm text-muted-foreground">Loading search data…</p>}
      {!snapshot && error && <p className="py-3 text-sm text-destructive">{error}</p>}
      {selected && (selected.status === 'not_configured' || selected.status === 'error') && (
        <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4">
          <p className="text-sm font-bold">{selected.message}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            The rest of analytics is unaffected. Add this provider's server credentials when ready.
          </p>
        </div>
      )}
      {selected && (selected.status === 'ready' || selected.status === 'stale') && (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <Seg ariaLabel="Search date range" options={RANGES} value={range} onChange={setRange} />
            <span className="text-[0.68rem] font-semibold text-muted-foreground">
              Data through {shortDate(selected.dataThrough)} · synced {shortDate(selected.fetchedAt)}
            </span>
          </div>
          {selected.message && (
            <p className={cn('mb-3 text-xs', selected.status === 'stale' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground')}>
              {selected.message}
            </p>
          )}
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4">
            <Kpi emphasis value={compact(metric.clicks)} label="Search clicks" denom={`${range} days`} />
            <Kpi value={compact(metric.impressions)} label="Impressions" />
            <Kpi value={percent(metric.ctr)} label="Click-through rate" />
            <Kpi value={position(metric.position)} label="Average position" />
          </div>
          <SearchTrend daily={selected.daily} days={Number(range)} />
          <div className="mt-5 grid gap-5 border-t border-border pt-4 md:grid-cols-2">
            <DetailRows title="Top pages · 28d" rows={selected.pages} kind="page" />
            <DetailRows title="Top queries · 28d" rows={selected.queries} kind="query" />
          </div>
        </>
      )}
    </Panel>
  );
}
