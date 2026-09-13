import type { CrossToolSnapshot, ToolDef } from '../../../api/_crossTool';
import { Panel, Kpi } from '@/components/admin/ui';
import { ToolVenn } from '@/components/admin/charts/ToolVenn';
import { colorOf } from '@/components/admin/charts/vennAreas';

function fmtPct(pct: number | null): string {
  return pct === null ? '–' : `${pct}%`;
}

function SharedLegend({ catalog }: { catalog: ToolDef[] }) {
  return (
    <div
      data-testid="cross-tool-legend"
      className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] font-semibold text-muted-foreground"
    >
      {catalog.map((t, i) => (
        <span key={t.id} className="inline-flex items-center gap-1.5">
          <span className="inline-block size-2 rounded-full" style={{ background: colorOf(t.id, i) }} />
          {t.short}
        </span>
      ))}
      {catalog.length >= 2 && <span>both</span>}
    </div>
  );
}

/**
 * Opportunity conversion, companion share, league⊂dex, and arrival-era Venns.
 */
export function CrossToolCard({ data }: { data: CrossToolSnapshot }) {
  const browsers = data.eras.reduce((n, e) => n + e.browsers, 0);
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
      <div data-testid="cross-tool-venns" className="mt-3 grid grid-cols-2 gap-x-2 gap-y-3 md:gap-x-6">
        {data.eras.map((era) => (
          <ToolVenn key={era.key} era={era} catalog={data.catalog} />
        ))}
      </div>
      <SharedLegend catalog={data.catalog} />
    </Panel>
  );
}
