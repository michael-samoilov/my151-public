import type { CrossToolSnapshot } from '../../../api/_crossTool';
import { Panel, Kpi } from '@/components/admin/ui';
import { ToolVenn } from '@/components/admin/charts/ToolVenn';

function fmtPct(pct: number | null): string {
  return pct === null ? '–' : `${pct}%`;
}

/**
 * Opportunity conversion, companion share, league⊂dex, and arrival-era Venns.
 */
export function CrossToolCard({ data }: { data: CrossToolSnapshot }) {
  const browsers = data.eras.reduce((n, e) => n + e.browsers, 0);
  const conv = data.kpis.find((k) => k.key.endsWith('-to-league')) ?? data.kpis[0];
  return (
    <Panel
      title="Cross-tool"
      sub={['dex & league']}
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
      {conv && (
        <p className="mt-2 text-[0.7rem] text-muted-foreground">{conv.hint}.</p>
      )}
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-2">
        {data.eras.map((era) => (
          <ToolVenn key={era.key} era={era} catalog={data.catalog} />
        ))}
      </div>
    </Panel>
  );
}
