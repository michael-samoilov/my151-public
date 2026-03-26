import { useAnalytics } from '@/hooks/useAnalytics';
import { TYPE_COLORS } from '@/data/type-colors';
import { ScrollArea } from '@/components/ui/scroll-area';
import { WhatsAdvisor } from './WhatsAdvisor';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, ReferenceLine,
} from 'recharts';

const GEN_COLORS = ['#e74c3c', '#f39c12', '#2ecc71', '#3498db', '#9b59b6', '#1abc9c', '#e67e22', '#34495e', '#c0392b'];

export function AnalyticsDashboard() {
  const analytics = useAnalytics();

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
          <StatCard label="Avg BST" value={analytics.bstStats.avg.toString()} subtitle={`Region avg: ${analytics.bstStats.averageRegion}`} />
          <StatCard label="Legendaries" value={analytics.legendaryCount.toString()} />
          <StatCard label="Mythicals" value={analytics.mythicalCount.toString()} />
        </div>

        {/* Type Distribution with Deviation */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Type Distribution</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Your type spread vs typical regional dex. Bars above zero = over-indexing.
          </p>
          <div className="bg-card rounded-lg border p-4" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.typeDeviation}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="type"
                  tick={{ fontSize: 10 }}
                  interval={0}
                  angle={-45}
                  textAnchor="end"
                  height={50}
                />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <Tooltip
                  formatter={((value: any, name: any) => [
                    `${Number(value).toFixed(1)}%`,
                    name === 'deviation' ? 'Deviation from avg' : name,
                  ]) as any}
                />
                <ReferenceLine y={0} stroke="#666" />
                <Bar dataKey="deviation" name="Deviation from avg">
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
            Where your Pokemon come from vs typical regional dex composition.
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
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" unit="%" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="generation"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => `Gen ${v}`}
                    width={50}
                  />
                  <Tooltip
                    formatter={((value: any) => [`${Number(value).toFixed(1)}%`, 'Deviation']) as any}
                  />
                  <ReferenceLine x={0} stroke="#666" />
                  <Bar dataKey="deviation" name="vs Average">
                    {analytics.generationDeviation.map((entry, i) => (
                      <Cell
                        key={entry.generation}
                        fill={entry.deviation >= 0 ? GEN_COLORS[i % GEN_COLORS.length] : '#999'}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Evolution Stats */}
        <section>
          <h3 className="text-lg font-semibold mb-1">Evolution & Stage Stats</h3>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-card rounded-lg border p-4">
              <p className="text-sm text-muted-foreground">Avg Evolution Level</p>
              <p className="text-3xl font-bold">{analytics.evolutionStats.avgLevel || 'N/A'}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Regional average: ~{analytics.evolutionStats.averageRegionLevel}
                {analytics.evolutionStats.avgLevel > 0 && analytics.evolutionStats.averageRegionLevel != null && (
                  <span className={analytics.evolutionStats.avgLevel > analytics.evolutionStats.averageRegionLevel! ? ' text-orange-500' : ' text-green-500'}>
                    {' '}({analytics.evolutionStats.avgLevel > analytics.evolutionStats.averageRegionLevel! ? 'Higher' : 'Lower'} than typical)
                  </span>
                )}
              </p>
            </div>
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

        {/* BST Distribution */}
        <section>
          <h3 className="text-lg font-semibold mb-1">BST Distribution</h3>
          <div className="grid md:grid-cols-4 gap-4">
            <StatCard label="Min BST" value={analytics.bstStats.min.toString()} />
            <StatCard label="Max BST" value={analytics.bstStats.max.toString()} />
            <StatCard label="Average BST" value={analytics.bstStats.avg.toString()} subtitle={`Typical: ~${analytics.bstStats.averageRegion}`} />
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
