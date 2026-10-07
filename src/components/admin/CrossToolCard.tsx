import type { CrossToolSnapshot } from '../../../api/_crossTool';
import { Panel, Kpi } from '@/components/admin/ui';
import { ToolEuler } from '@/components/admin/charts/ToolEuler';
import { useMemo } from 'react';

function fmtPct(pct: number | null): string {
  return pct === null ? '–' : `${pct}%`;
}

/**
 * Opportunity conversion, companion share, league⊂dex, and one area-exact
 * diagram of every browser in the range by the tools it ever used.
 */
export function CrossToolCard({ data }: { data: CrossToolSnapshot }) {
  const browsers = data.eras.reduce((n, e) => n + e.browsers, 0);
  const regions = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const era of data.eras) for (const [key, n] of Object.entries(era.regions)) sum[key] = (sum[key] ?? 0) + n;
    return sum;
  }, [data.eras]);
  return (
    <Panel
      title="Cross-tool"
      sub={[data.catalog.map(t => t.short.toLowerCase()).join(' & ')]}
      actions={
        <span className="text-[0.7rem] font-semibold tabular-nums text-muted-foreground">
          {browsers} browsers
        </span>
      }
    >
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        {data.kpis.map((k) => (
          <div key={k.key} title={k.hint}>
            <Kpi value={fmtPct(k.pct)} label={k.label} denom={`${k.n} / ${k.of}`} />
          </div>
        ))}
      </div>
      <div data-testid="cross-tool-venns" className="mt-3">
        <ToolEuler regions={regions} catalog={data.catalog} />
      </div>
    </Panel>
  );
}
