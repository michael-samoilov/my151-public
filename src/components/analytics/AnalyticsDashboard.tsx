import { useMemo } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAdvisor } from './WhatsAdvisor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  Cell, CartesianGrid, ReferenceLine, LabelList,
} from 'recharts';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

/** Align yours + national histograms to the same bins, compute shared Y max */
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

  // Use numeric center of bin for X positioning
  const yoursAligned = bins.map(bin => ({ x: parseInt(bin) + binSize / 2, pct: yoursMap.get(bin) ?? 0 }));
  const nationalAligned = bins.map(bin => ({ x: parseInt(bin) + binSize / 2, pct: nationalMap.get(bin) ?? 0 }));

  // X-axis boundary ticks
  const tickStep = xTickInterval ?? binSize;
  const minBin = parseInt(bins[0]);
  const maxBin = parseInt(bins[bins.length - 1]);
  // Snap start to a multiple of tickStep
  const tickStart = Math.floor(minBin / tickStep) * tickStep;
  const tickEnd = maxBin + binSize;
  const xTicks: number[] = [];
  for (let t = tickStart; t <= tickEnd; t += tickStep) xTicks.push(t);
  const xDomain: [number, number] = [tickStart, tickEnd];

  const yMax = Math.max(
    ...yoursAligned.map(d => d.pct),
    ...nationalAligned.map(d => d.pct),
    1,
  );
  // Round up to nearest 10 for clean axis
  const yDomain = Math.ceil(yMax / 10) * 10;
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);

  return { yoursAligned, nationalAligned, xTicks, xDomain, binSize, yDomain, yTicks };
}

export function AnalyticsDashboard() {
  const analytics = useAnalytics();

  // Type deviation axis: symmetric around 0, ticks at multiples of 50%
  const typeDevMax = useMemo(() => {
    const maxAbs = Math.max(...analytics.typeDeviation.map(e => Math.abs(e.deviation)), 50);
    return Math.ceil(maxAbs / 50) * 50;
  }, [analytics.typeDeviation]);

  const typeDevTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = -typeDevMax; t <= typeDevMax; t += 50) ticks.push(t);
    return ticks;
  }, [typeDevMax]);

  // Generation deviation axis: symmetric around 0, ticks at multiples of 50%
  const genDevMax = useMemo(() => {
    const maxAbs = Math.max(...analytics.generationDeviation.map(e => Math.abs(e.deviation)), 50);
    return Math.ceil(maxAbs / 50) * 50;
  }, [analytics.generationDeviation]);

  const genDevTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = -genDevMax; t <= genDevMax; t += 50) ticks.push(t);
    return ticks;
  }, [genDevMax]);

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
    <ScrollArea className="h-full">
      <div className="p-6 space-y-8 max-w-6xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Pokemon" value={`${analytics.total}/151`} />
          <StatCard label="Avg BST" value={analytics.bstStats.avg.toString()} subtitle={`National avg: ${analytics.nationalAvgBst}`} />
          <StatCard label="Legendaries" value={analytics.legendaryCount.toString()} />
          <StatCard label="Mythicals" value={analytics.mythicalCount.toString()} />
        </div>

        {/* Type Distribution */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Type Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Count and deviation from national dex proportions. Sorted most over- to most underrepresented.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex gap-0">
              <div style={{ flex: '0 0 30%' }} />
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center" style={{ flex: '0 0 70%' }}>Over / Under Represented</div>
            </div>
            <div className="flex gap-0" style={{ height: 460 }}>
              {/* Count chart (left) — Y-axis labels serve as shared labels */}
              <div style={{ flex: '0 0 30%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.typeDeviation} layout="vertical" margin={{ right: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="type"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                      width={55}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip formatter={((value: any) => [value, 'Pokemon']) as any} />
                    <Bar dataKey="count" name="Pokemon" fill="#94a3b8">
                      <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                      {analytics.typeDeviation.map((entry) => (
                        <Cell key={entry.type} fill={TYPE_COLORS[entry.type as keyof typeof TYPE_COLORS]} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Deviation chart (right) */}
              <div style={{ flex: '0 0 70%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.typeDeviation} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      ticks={typeDevTicks}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                      domain={[-typeDevMax, typeDevMax]}
                    />
                    <YAxis type="category" dataKey="type" hide />
                    <ReferenceLine x={0} stroke="var(--color-muted-foreground)" strokeWidth={1} />
                    <Tooltip
                      formatter={((value: any) => [
                        `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(0)}%`,
                        'vs national dex',
                      ]) as any}
                    />
                    <Bar dataKey="deviation" name="vs national dex">
                      {analytics.typeDeviation.map((entry) => (
                        <Cell key={entry.type} fill={TYPE_COLORS[entry.type as keyof typeof TYPE_COLORS]} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Generation Origin */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Generation Origin</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Where your Pokemon come from and deviation from national dex proportions.
          </p>
          <div className="bg-card rounded-lg border p-4">
            <div className="flex gap-0">
              <div style={{ flex: '0 0 25%' }} />
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide text-center" style={{ flex: '0 0 75%' }}>Over / Under Represented</div>
            </div>
            <div className="flex gap-0" style={{ height: 280 }}>
              {/* Count chart (left) — Y-axis labels serve as shared labels */}
              <div style={{ flex: '0 0 25%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.generationDeviation} layout="vertical" margin={{ right: 4 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="generation"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => `Gen ${v}`}
                      width={42}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip formatter={((value: any) => [value, 'Pokemon']) as any} labelFormatter={(v) => `Gen ${v}`} />
                    <Bar dataKey="count" name="Pokemon" fill="#94a3b8">
                      <LabelList dataKey="count" position="right" style={{ fontSize: 10, fill: 'var(--color-muted-foreground)' }} />
                      {analytics.generationDeviation.map((entry, i) => (
                        <Cell key={entry.generation} fill={GEN_COLORS[i % GEN_COLORS.length]} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* Deviation chart (right) */}
              <div style={{ flex: '0 0 75%', height: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={analytics.generationDeviation} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis
                      type="number"
                      ticks={genDevTicks}
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v}%`}
                      domain={[-genDevMax, genDevMax]}
                    />
                    <YAxis type="category" dataKey="generation" hide />
                    <ReferenceLine x={0} stroke="var(--color-muted-foreground)" strokeWidth={1} />
                    <Tooltip
                      formatter={((value: any) => [
                        `${Number(value) > 0 ? '+' : ''}${Number(value).toFixed(0)}%`,
                        'vs national dex',
                      ]) as any}
                      labelFormatter={(v) => `Gen ${v}`}
                    />
                    <Bar dataKey="deviation" name="vs national dex">
                      {analytics.generationDeviation.map((entry, i) => (
                        <Cell key={entry.generation} fill={GEN_COLORS[i % GEN_COLORS.length]} opacity={0.85} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </section>

        {/* Evolution Level Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Evolution Level Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.evolutionStats.avgLevel || 'N/A'}, National avg: {analytics.evolutionStats.nationalAvgLevel}.
          </p>
          <div className="bg-card rounded-lg border p-4 space-y-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Yours</p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evoHist.yoursAligned} barCategoryGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={evoHist.xDomain} ticks={evoHist.xTicks} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, evoHist.yDomain]} ticks={evoHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'Yours']) as any} />
                  <Bar dataKey="pct" name="Yours" fill="#ef4444" opacity={0.85} barSize={undefined} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">National Dex</p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evoHist.nationalAligned} barCategoryGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={evoHist.xDomain} ticks={evoHist.xTicks} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, evoHist.yDomain]} ticks={evoHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'National']) as any} />
                  <Bar dataKey="pct" name="National" fill="#94a3b8" opacity={0.7} barSize={undefined} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* BST Histogram */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Base Stat Total Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Yours avg: {analytics.bstStats.avg}, National avg: {analytics.nationalAvgBst}.
          </p>
          <div className="bg-card rounded-lg border p-4 space-y-0">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">Yours</p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bstHist.yoursAligned} barCategoryGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={bstHist.xDomain} ticks={bstHist.xTicks} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, bstHist.yDomain]} ticks={bstHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'Yours']) as any} />
                  <Bar dataKey="pct" name="Yours" fill="#ef4444" opacity={0.85} barSize={undefined} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">National Dex</p>
            <div style={{ height: 190 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bstHist.nationalAligned} barCategoryGap={0}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="x" type="number" domain={bstHist.xDomain} ticks={bstHist.xTicks} tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, bstHist.yDomain]} ticks={bstHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'National']) as any} />
                  <Bar dataKey="pct" name="National" fill="#94a3b8" opacity={0.7} barSize={undefined} />
                </BarChart>
              </ResponsiveContainer>
            </div>
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
      </div>
    </ScrollArea>
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
