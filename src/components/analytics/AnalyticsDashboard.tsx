import React, { useMemo, useState } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAdvisor } from './WhatsAdvisor';
import { ButterflyChart, type ButterflyRow } from './ButterflyChart';
import { SuperimposedHistogram } from './SuperimposedHistogram';
import { GEN_STOPS } from '@/components/shared/GenBadge';
import { RegionalDexCarousel } from './RegionalDexCarousel';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

const POKEAPI_TYPE_IDS: Record<string, number> = {
  normal: 1, fighting: 2, flying: 3, poison: 4, ground: 5, rock: 6,
  bug: 7, ghost: 8, steel: 9, fire: 10, water: 11, grass: 12,
  electric: 13, psychic: 14, ice: 15, dragon: 16, dark: 17, fairy: 18,
};
const TYPE_ICON_URLS: Record<string, string> = Object.fromEntries(
  Object.entries(POKEAPI_TYPE_IDS).map(([type, id]) => [
    type,
    `/sprites/types/${id}.png`,
  ]),
);

/** Align yours + national histograms to the same bins, merge into single dataset */
function alignHistograms(
  yours: { bin: string; pct: number }[],
  national: { bin: string; pct: number }[],
  binSize: number,
  xTickInterval?: number,
) {
  // Collect all bins from both
  const allBins = new Set<string>();
  for (const y of yours) allBins.add(y.bin);
  for (const n of national) allBins.add(n.bin);
  const bins = [...allBins].sort((a, b) => parseInt(a) - parseInt(b));

  const yoursMap = new Map(yours.map(y => [y.bin, y.pct]));
  const nationalMap = new Map(national.map(n => [n.bin, n.pct]));

  // Merged data: one entry per bin with both pct values
  const merged = bins.map(bin => ({
    x: parseInt(bin) + binSize / 2,
    nationalPct: nationalMap.get(bin) ?? 0,
    yoursPct: yoursMap.get(bin) ?? 0,
  }));

  // X-axis boundary ticks
  const tickStep = xTickInterval ?? binSize;
  const minBin = parseInt(bins[0]);
  const maxBin = parseInt(bins[bins.length - 1]);
  const tickStart = Math.floor(minBin / tickStep) * tickStep;
  const tickEnd = maxBin + binSize;
  const xTicks: number[] = [];
  for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
  const xDomain: [number, number] = [tickStart, tickEnd];

  const yMax = Math.max(
    ...merged.map(d => Math.max(d.nationalPct, d.yoursPct)),
    1,
  );
  const yDomain = Math.ceil(yMax / 10) * 10;
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);

  return { merged, xTicks, xDomain, binSize, yDomain, yTicks };
}

export function AnalyticsDashboard() {
  const [excludeSpecial, setExcludeSpecial] = useState(false);
  const analytics = useAnalytics(excludeSpecial);

  // Butterfly chart data
  const typeChartData: ButterflyRow[] = useMemo(() =>
    analytics.typeDeviation.map((d) => ({
      label: d.type.charAt(0).toUpperCase() + d.type.slice(1),
      count: d.count,
      deviation: d.deviation,
      color: TYPE_COLORS[d.type as keyof typeof TYPE_COLORS],
      icon: TYPE_ICON_URLS[d.type],
    })),
    [analytics.typeDeviation],
  );

  const genChartData: ButterflyRow[] = useMemo(() =>
    analytics.generationDeviation.map((d, i) => {
      const gen = d.generation;
      const stops = GEN_STOPS[gen] ?? [{ offset: '100%', color: '#888' }];
      return {
        label: `Gen ${gen}`,
        count: d.count,
        deviation: d.deviation,
        color: GEN_COLORS[i % GEN_COLORS.length],
        icon: (x: number, y: number, size: number) => {
          const gradId = `gen-icon-grad-${gen}`;
          const r = size / 2;
          return (
            <React.Fragment key={`gen-icon-${gen}`}>
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

  const evoHist = useMemo(
    () => alignHistograms(analytics.yourEvoHistogram, analytics.nationalEvoHistogram, 5),
    [analytics.yourEvoHistogram, analytics.nationalEvoHistogram],
  );
  const bstHist = useMemo(
    () => alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram, 50, 100),
    [analytics.yourBstHistogram, analytics.nationalBstHistogram],
  );

  if (analytics.total === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <p className="text-xl font-semibold text-muted-foreground">No Pokemon assigned yet</p>
          <p className="text-sm text-muted-foreground">
            Add Pokemon to your Pokedex to see analytics
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden">
      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pokemon" value={`${analytics.total}/151`} />
          <StatCard label="Avg BST" value={analytics.bstStats.avg.toString()} subtitle={`National avg: ${analytics.nationalAvgBst}`} />
          <StatCard label="Legendaries" value={analytics.legendaryCount.toString()} />
          <StatCard label="Mythicals" value={analytics.mythicalCount.toString()} />
        </div>

        {/* Exclusion Toggle */}
        <div className="flex items-center">
          <button
            onClick={() => setExcludeSpecial(prev => !prev)}
            className={`flex items-center gap-2 px-3 min-h-[44px] rounded-full text-sm font-medium transition-colors ${
              excludeSpecial
                ? 'bg-muted-foreground/15 text-foreground'
                : 'bg-transparent text-muted-foreground border border-muted-foreground/25'
            }`}
          >
            <span className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
              excludeSpecial ? 'border-foreground bg-foreground' : 'border-muted-foreground/50'
            }`}>
              {excludeSpecial && <span className="block w-1.5 h-1.5 rounded-full bg-background" />}
            </span>
            Exclude Legendaries, Mythicals &amp; Starters
          </button>
        </div>

        {/* Type Distribution */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Type Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Count and deviation from national dex proportions. Sorted most over- to most underrepresented.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <ButterflyChart data={typeChartData} />
          </div>
        </section>

        {/* Generation Origin */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Generation Origin</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Where your Pokemon come from and deviation from national dex proportions.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <ButterflyChart data={genChartData} rowHeight={28} />
          </div>
        </section>

        {/* Evolution Level Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Evolution Level Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.evolutionStats.avgLevel || 'N/A'}, National avg: {analytics.evolutionStats.nationalAvgLevel}.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-[10px] text-muted-foreground font-medium">National Dex</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-[10px] text-muted-foreground font-medium">Yours</span>
              </div>
            </div>
            <SuperimposedHistogram
              data={evoHist.merged}
              binSize={evoHist.binSize}
              xDomain={evoHist.xDomain}
              xTicks={evoHist.xTicks}
              yDomain={evoHist.yDomain}
              yTicks={evoHist.yTicks}
            />
          </div>
        </section>

        {/* BST Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Base Stat Total Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.bstStats.avg}, National avg: {analytics.nationalAvgBst}.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex items-center gap-4 mb-2">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />
                <span className="text-[10px] text-muted-foreground font-medium">National Dex</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />
                <span className="text-[10px] text-muted-foreground font-medium">Yours</span>
              </div>
            </div>
            <SuperimposedHistogram
              data={bstHist.merged}
              binSize={bstHist.binSize}
              xDomain={bstHist.xDomain}
              xTicks={bstHist.xTicks}
              minorXTicks={bstHist.xTicks.slice(0, -1).map((t, i) => (t + bstHist.xTicks[i + 1]) / 2)}
              yDomain={bstHist.yDomain}
              yTicks={bstHist.yTicks}
            />
          </div>
        </section>

        {/* Evolution & Stage Stats */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Evolution & Stage Stats</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Stage Distribution</p>
              <div className="mt-2 space-y-1">
                {([1, 2, 3] as const).map((stage) => {
                  const count = analytics.evolutionStats.stageDistribution[stage];
                  const pct = ((count / analytics.total) * 100).toFixed(0);
                  return (
                    <div key={stage} className="flex items-center gap-2">
                      <span className="text-xs w-16">Stage {stage}</span>
                      <div className="flex-1 bg-muted rounded-full h-3">
                        <div
                          className="bg-primary rounded-full h-3 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-16 text-right">
                        {count} ({pct}%)
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="bg-card rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Type Composition</p>
              <div className="mt-2 space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Mono-type</span>
                  <span className="font-semibold">{analytics.monoTypeCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Dual-type</span>
                  <span className="font-semibold">{analytics.dualTypeCount}</span>
                </div>
                <div className="flex justify-between text-muted-foreground text-xs">
                  <span>Dual-type ratio</span>
                  <span>{((analytics.dualTypeCount / analytics.total) * 100).toFixed(0)}%</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BST Summary */}
        <section>
          <h3 className="text-lg font-semibold mb-1">BST Summary</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard label="Min BST" value={analytics.bstStats.min.toString()} />
            <StatCard label="Max BST" value={analytics.bstStats.max.toString()} />
            <StatCard label="Average BST" value={analytics.bstStats.avg.toString()} subtitle={`National: ${analytics.nationalAvgBst}`} />
            <StatCard label="Median BST" value={analytics.bstStats.median.toString()} />
          </div>
        </section>

        {/* What's Missing Advisor */}
        <section className="bg-card rounded-lg border p-6">
          <WhatsAdvisor />
        </section>

        {/* Regional Dex Comparison */}
        <RegionalDexCarousel excludeSpecial={excludeSpecial} />
      </div>
    </div>
  );
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-card rounded-lg border p-4">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
      {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
    </div>
  );
}
