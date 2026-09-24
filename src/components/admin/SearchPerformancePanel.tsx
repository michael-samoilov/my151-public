import { Panel } from '@/components/admin/ui';
import type {
  SearchIntelligenceView,
  SearchPageEngineView,
  SearchPeriodComparison,
  SearchRecommendation,
} from '@/lib/searchIntelligence';
import type { SearchProviderKey, SearchProviderStatus } from '@/lib/searchPerformance';
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
  if (!value) return 'not available';
  const parsed = Date.parse(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: value.length === 10 ? undefined : 'numeric',
    timeZone: 'UTC',
  }).format(parsed);
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

function comparisonDelta(
  comparison: SearchPeriodComparison,
  metric: 'clicks' | 'impressions',
): string {
  if (!comparison.available) return 'not enough data';
  const absolute = comparison.delta[metric];
  const relative = comparison.delta[`${metric}Pct`];
  return relative == null
    ? `${signed(absolute)} · not enough data for %`
    : `${signed(absolute)} · ${signedPercent(relative)}`;
}

function MetricCell({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[0.68rem] font-medium leading-tight text-muted-foreground">{detail}</p>
    </div>
  );
}

function ProviderRow({
  label,
  provider,
}: {
  label: string;
  provider: SearchIntelligenceView['providers'][SearchProviderKey];
}) {
  const { comparison } = provider;
  const usable = provider.status === 'ready' || provider.status === 'stale';
  return (
    <article
      aria-label={`${label} ${statusLabel(provider.status)}`}
      className="grid gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 md:grid-cols-[9rem_repeat(4,minmax(0,1fr))] md:items-start"
    >
      <div>
        <div className="flex items-center gap-1.5 text-sm font-bold">
          <span className={cn('size-1.5 rounded-full', statusDot(provider.status))} />
          {label}
          <span className="font-semibold text-muted-foreground">{statusLabel(provider.status)}</span>
        </div>
        <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">
          Through {shortDate(provider.dataThrough)}
          {provider.provider === 'google' ? ' · usual 2–3 day lag' : ''}
        </p>
      </div>
      {usable ? (
        <div className="grid grid-cols-2 gap-4 md:contents">
          <MetricCell
            label="Clicks"
            value={compact(comparison.current.metric.clicks)}
            detail={comparisonDelta(comparison, 'clicks')}
          />
          <MetricCell
            label="Impressions"
            value={compact(comparison.current.metric.impressions)}
            detail={comparisonDelta(comparison, 'impressions')}
          />
          <MetricCell
            label="CTR"
            value={percent(comparison.current.metric.ctr)}
            detail={
              comparison.available
                ? `${comparison.delta.ctrPoints > 0 ? '+' : ''}${(comparison.delta.ctrPoints * 100).toFixed(2)}pt`
                : 'not enough data'
            }
          />
          <MetricCell
            label="Position"
            value={position(comparison.current.metric.position)}
            detail={
              comparison.available && comparison.delta.position != null
                ? `${comparison.delta.position > 0 ? '+' : ''}${comparison.delta.position.toFixed(1)} vs prior`
                : 'not enough data'
            }
          />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground md:col-span-4">No search metrics are available from this provider.</p>
      )}
    </article>
  );
}

function recommendationLabel(kind: SearchRecommendation['kind']): string {
  if (kind === 'material_decline') return 'Material decline';
  if (kind === 'emerging_page') return 'Emerging page';
  if (kind === 'search_engine_gap') return 'Engine gap';
  if (kind === 'snippet_opportunity') return 'Snippet opportunity';
  if (kind === 'striking_distance') return 'Striking distance';
  return 'Wait for data';
}

function PrimaryFocus({ recommendation }: { recommendation: SearchRecommendation }) {
  return (
    <section
      data-testid="search-primary-focus"
      className="grid gap-4 border-y border-foreground/20 bg-muted/30 px-3 py-4 md:grid-cols-[4.5rem_minmax(0,1fr)] md:px-4"
    >
      <div className="flex items-start justify-between md:block">
        <span className="text-3xl font-black tabular-nums tracking-tighter">01</span>
        <span className="rounded-full border border-foreground/20 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] md:mt-2 md:inline-block">
          Heuristic
        </span>
      </div>
      <div className="min-w-0">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">
          Recommended focus · {recommendationLabel(recommendation.kind)}
        </p>
        <h3 className="mt-1 text-xl font-black leading-tight tracking-tight">{recommendation.title}</h3>
        <ul className="mt-3 grid gap-1 text-xs leading-relaxed text-muted-foreground">
          {recommendation.evidence.map((item) => <li key={item}>• {item}</li>)}
        </ul>
        <div className="mt-3 border-l-2 border-primary pl-3">
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-primary">Single next action</p>
          <p className="mt-0.5 text-sm font-bold leading-snug">{recommendation.action}</p>
        </div>
      </div>
    </section>
  );
}

function SecondaryFocus({ recommendations }: { recommendations: SearchRecommendation[] }) {
  if (recommendations.length === 0) return null;
  return (
    <section className="grid border-b border-border md:grid-cols-3">
      {recommendations.map((item, index) => (
        <article
          key={`${item.kind}:${item.page}`}
          className="border-b border-border py-3 last:border-b-0 md:border-b-0 md:border-r md:px-3 md:first:pl-0 md:last:border-r-0 md:last:pr-0"
        >
          <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            0{index + 2} · {recommendationLabel(item.kind)}
          </p>
          <p className="mt-1 text-xs font-bold leading-snug">{item.title}</p>
          <p className="mt-1 text-[0.68rem] leading-snug text-muted-foreground">{item.evidence[0]}</p>
        </article>
      ))}
    </section>
  );
}

function EngineMetric({ provider, engine }: { provider: string; engine: SearchPageEngineView }) {
  const metric = engine.current;
  if (!metric) {
    return (
      <div className="rounded-lg border border-dashed border-border px-3 py-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{provider}</p>
        <p className="mt-1 text-xs text-muted-foreground">No page detail reported.</p>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">{provider}</p>
        <p className="text-[0.68rem] font-semibold tabular-nums text-muted-foreground">
          {engine.direction
            ? `${signed(engine.direction.impressions)} imp${engine.direction.impressionsPct == null ? '' : ` · ${signedPercent(engine.direction.impressionsPct)}`}`
            : 'no prior page window'}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-xs">
        <PageMetric label="Clicks" value={compact(metric.clicks)} />
        <PageMetric label="Impr." value={compact(metric.impressions)} />
        <PageMetric label="CTR" value={percent(metric.ctr)} />
        <PageMetric label="Pos." value={position(metric.position)} />
      </div>
    </div>
  );
}

function PageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-bold tabular-nums">{value}</p>
      <p className="text-[0.62rem] text-muted-foreground">{label}</p>
    </div>
  );
}

function PageRow({ page }: { page: SearchIntelligenceView['pages'][number] }) {
  return (
    <article
      data-testid={`search-page-${page.path === '/' ? 'home' : page.path.slice(1)}`}
      className="border-t border-border py-4 first:border-t-0 first:pt-0"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <h3 className="text-sm font-black">{page.label}</h3>
          <p className="font-mono text-[0.68rem] text-muted-foreground">{page.path}</p>
        </div>
        <p className="text-xs font-semibold tabular-nums text-muted-foreground">
          <span className="text-foreground">{compact(page.clicks)}</span> clicks ·{' '}
          <span className="text-foreground">{compact(page.impressions)}</span> impressions across engines
        </p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <EngineMetric provider="Google" engine={page.engines.google} />
        <EngineMetric provider="Bing" engine={page.engines.bing} />
      </div>
      <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Top Google queries</span>
        {page.topQueries.length ? page.topQueries.map((query) => (
          <span key={`${query.provider}:${query.query}`} className="max-w-full rounded-full bg-muted px-2 py-1 text-[0.68rem] font-semibold">
            {query.query}{' '}
            <span className="font-normal tabular-nums text-muted-foreground">· {compact(query.impressions)} imp</span>
          </span>
        )) : <span className="text-[0.68rem] text-muted-foreground">No page-query pair reported.</span>}
      </div>
    </article>
  );
}

function ReleaseStrip({ release }: { release: SearchIntelligenceView['release'] }) {
  return (
    <section className="my-4 grid gap-2 border-y border-dashed border-border py-3 text-xs md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <div className="min-w-0">
        <p className="text-[0.62rem] font-bold uppercase tracking-[0.14em] text-muted-foreground">Current release</p>
        <p className="mt-1 truncate font-semibold">
          {release.environment}
          {release.gitSha ? ` · ${release.gitSha}` : ''}
          {release.gitRef ? ` · ${release.gitRef}` : ''}
        </p>
        {release.gitMessage && <p className="mt-0.5 truncate text-muted-foreground">{release.gitMessage}</p>}
      </div>
      <p className="max-w-sm text-[0.68rem] leading-snug text-muted-foreground">
        Deployment history is not connected, so search changes are not attributed to releases.
      </p>
    </section>
  );
}

function ChangeLog({ entries }: { entries: SearchIntelligenceView['changeLog']['entries'] }) {
  return (
    <section className="mt-4 border-t border-border pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-black">SEO change log</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">Read-only foundation</span>
      </div>
      {entries.length === 0 ? (
        <div className="mt-2 rounded-lg border border-dashed border-border p-3">
          <p className="text-xs font-bold">No SEO changes are recorded.</p>
          <p className="mt-1 text-[0.68rem] leading-relaxed text-muted-foreground">
            An authoritative entry needs page, shipped date, exact change, hypothesis, baseline window, and later outcome. Server persistence is deliberately deferred; browser storage is not used as a source of truth.
          </p>
        </div>
      ) : null}
    </section>
  );
}

export function SearchPerformancePanel({
  snapshot,
  loading,
  error,
}: {
  snapshot: SearchIntelligenceView | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Panel
      title="Search intelligence"
      sub={snapshot ? ['28 days vs prior 28', 'page-first'] : undefined}
      className="overflow-hidden"
    >
      <div data-testid="search-intelligence">
        {!snapshot && loading && <p className="py-8 text-sm text-muted-foreground">Loading search data…</p>}
        {!snapshot && error && <p className="py-3 text-sm text-destructive">{error}</p>}
        {snapshot && (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="text-[0.68rem] font-semibold text-muted-foreground">
                Current period ends on each engine's latest complete date. Positions stay engine-specific.
              </p>
              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-1 text-[0.65rem] font-bold text-amber-900">
                Conversion signal not connected
              </span>
            </div>

            <section aria-label="Provider freshness and matched-period performance">
              {PROVIDERS.map(({ key, label }) => (
                <ProviderRow key={key} label={label} provider={snapshot.providers[key]} />
              ))}
            </section>

            <ReleaseStrip release={snapshot.release} />
            <PrimaryFocus recommendation={snapshot.focus.primary} />
            <SecondaryFocus recommendations={snapshot.focus.secondary} />

            <section className="mt-4">
              <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-black">Pages</h3>
                <p className="text-[0.68rem] text-muted-foreground">
                  Page and query detail can omit low-volume rows. Bing does not provide query-to-page pairs here.
                </p>
              </div>
              {snapshot.pages.map((page) => <PageRow key={page.path} page={page} />)}
            </section>

            <ChangeLog entries={snapshot.changeLog.entries} />
          </>
        )}
      </div>
    </Panel>
  );
}
