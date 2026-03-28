import { useMemo } from 'react';
import { useAnalytics } from '@/hooks/useAnalytics';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAdvisor } from './WhatsAdvisor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, ReferenceLine,
} from 'recharts';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

/** Align yours + national histograms to the same bins, compute shared Y max */
function alignHistograms(
  yours: { bin: string; pct: number }[],
  national: { bin: string; pct: number }[],
) {
  // Collect all bins from both
  const allBins = new Set<string>();
  for (const y of yours) allBins.add(y.bin);
  for (const n of national) allBins.add(n.bin);
  const bins = [...allBins].sort((a, b) => parseInt(a) - parseInt(b));

  const yoursMap = new Map(yours.map(y => [y.bin, y.pct]));
  const nationalMap = new Map(national.map(n => [n.bin, n.pct]));

  const yoursAligned = bins.map(bin => ({ bin, pct: yoursMap.get(bin) ?? 0 }));
  const nationalAligned = bins.map(bin => ({ bin, pct: nationalMap.get(bin) ?? 0 }));

  const yMax = Math.max(
    ...yoursAligned.map(d => d.pct),
    ...nationalAligned.map(d => d.pct),
    1,
  );
  // Round up to nearest 10 for clean axis
  const yDomain = Math.ceil(yMax / 10) * 10;
  // Ticks at multiples of 10
  const yTicks: number[] = [];
  for (let t = 0; t <= yDomain; t += 10) yTicks.push(t);

  return { yoursAligned, nationalAligned, yDomain, yTicks };
}

export function AnalyticsDashboard() {
  const analytics = useAnalytics();

  // Compute Y-axis domain and ticks: major at integers, minor at 0.5x
  const typeYMax = useMemo(() => {
    const maxRatio = Math.max(...analytics.typeDeviation.map(e => e.ratio), 1);
    return Math.ceil(maxRatio);
  }, [analytics.typeDeviation]);

  const typeYTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= typeYMax; i++) {
      ticks.push(i);
      if (i < typeYMax) ticks.push(i + 0.5);
    }
    return ticks;
  }, [typeYMax]);

  // Generation ratio chart ticks
  const genXMax = useMemo(() => {
    const maxRatio = Math.max(...analytics.generationDeviation.map(e => e.ratio), 1);
    return Math.ceil(maxRatio);
  }, [analytics.generationDeviation]);

  const genXTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let i = 0; i <= genXMax; i++) {
      ticks.push(i);
      if (i < genXMax) ticks.push(i + 0.5);
    }
    return ticks;
  }, [genXMax]);

  const evoHist = useMemo(
    () => alignHistograms(analytics.yourEvoHistogram, analytics.nationalEvoHistogram),
    [analytics.yourEvoHistogram, analytics.nationalEvoHistogram],
  );
  const bstHist = useMemo(
    () => alignHistograms(analytics.yourBstHistogram, analytics.nationalBstHistogram),
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

        {/* Type Distribution Ratio */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Type Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your type proportion relative to the national dex. 1x = matching, 2x = double, 0.5x = half. Sorted most to least represented.
          </p>
          <div className="bg-card rounded-lg border p-4" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.typeDeviation}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} horizontalPoints={[]} />
                <XAxis
                  dataKey="type"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: string) => v.charAt(0).toUpperCase() + v.slice(1)}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis
                  ticks={typeYTicks}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v: number) => `${v}x`}
                  domain={[0, typeYMax]}
                />
                <Tooltip
                  formatter={((value: any) => [
                    `${Number(value).toFixed(2)}x`,
                    'vs national dex',
                  ]) as any}
                />
                {/* Major grid lines at integer values (1x highlighted) */}
                {typeYTicks.filter(t => Number.isInteger(t) && t > 0).map(t => (
                  <ReferenceLine
                    key={`major-${t}`}
                    y={t}
                    stroke={t === 1 ? '#666' : '#d1d5db'}
                    strokeWidth={t === 1 ? 1.5 : 1}
                  />
                ))}
                {/* Minor grid lines at 0.5x values */}
                {typeYTicks.filter(t => !Number.isInteger(t)).map(t => (
                  <ReferenceLine key={`minor-${t}`} y={t} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="3 3" />
                ))}
                <Bar dataKey="ratio" name="vs national dex">
                  {analytics.typeDeviation.map((entry) => (
                    <Cell
                      key={entry.type}
                      fill={TYPE_COLORS[entry.type as keyof typeof TYPE_COLORS]}
                      opacity={0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Generation Origin */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Generation Origin</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Where your Pokemon come from. Ratio chart shows your proportion vs the national dex.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-card rounded-lg border p-4" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={analytics.generationDistribution.filter(g => g.count > 0)}
                    dataKey="count"
                    nameKey="generation"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label={((props: any) =>
                      `Gen ${props.generation}: ${props.percentage.toFixed(0)}%`
                    ) as any}
                    labelLine={false}
                  >
                    {analytics.generationDistribution.map((entry, i) => (
                      <Cell key={entry.generation} fill={GEN_COLORS[i % GEN_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={((value: any) => [value, 'Pokemon']) as any} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card rounded-lg border p-4" style={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={analytics.generationDeviation} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} verticalPoints={[]} />
                  <XAxis
                    type="number"
                    ticks={genXTicks}
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `${v}x`}
                    domain={[0, genXMax]}
                  />
                  <YAxis
                    type="category"
                    dataKey="generation"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `Gen ${v}`}
                    width={50}
                  />
                  <Tooltip
                    formatter={((value: any) => [`${Number(value).toFixed(2)}x`, 'vs national dex']) as any}
                  />
                  {/* Major grid lines at integer values (1x highlighted) */}
                  {genXTicks.filter(t => Number.isInteger(t) && t > 0).map(t => (
                    <ReferenceLine
                      key={`gen-major-${t}`}
                      x={t}
                      stroke={t === 1 ? '#666' : '#d1d5db'}
                      strokeWidth={t === 1 ? 1.5 : 1}
                    />
                  ))}
                  {/* Minor grid lines at 0.5x values */}
                  {genXTicks.filter(t => !Number.isInteger(t)).map(t => (
                    <ReferenceLine key={`gen-minor-${t}`} x={t} stroke="#e5e7eb" strokeWidth={0.5} strokeDasharray="3 3" />
                  ))}
                  <Bar dataKey="ratio" name="vs national dex">
                    {analytics.generationDeviation.map((entry, i) => (
                      <Cell
                        key={entry.generation}
                        fill={GEN_COLORS[i % GEN_COLORS.length]}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
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
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evoHist.yoursAligned} margin={{ bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bin" tick={false} height={0} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, evoHist.yDomain]} ticks={evoHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'Yours']) as any} />
                  <Bar dataKey="pct" name="Yours" fill="#ef4444" opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">National Dex</p>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evoHist.nationalAligned} margin={{ top: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bin" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, evoHist.yDomain]} ticks={evoHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'National']) as any} />
                  <Bar dataKey="pct" name="National" fill="#94a3b8" opacity={0.7} />
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
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bstHist.yoursAligned} margin={{ bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bin" tick={false} height={0} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, bstHist.yDomain]} ticks={bstHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'Yours']) as any} />
                  <Bar dataKey="pct" name="Yours" fill="#ef4444" opacity={0.85} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">National Dex</p>
            <div style={{ height: 160 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={bstHist.nationalAligned} margin={{ top: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="bin" tick={{ fontSize: 9 }} interval={0} angle={-45} textAnchor="end" height={45} />
                  <YAxis tick={{ fontSize: 10 }} unit="%" domain={[0, bstHist.yDomain]} ticks={bstHist.yTicks} />
                  <Tooltip formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'National']) as any} />
                  <Bar dataKey="pct" name="National" fill="#94a3b8" opacity={0.7} />
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
