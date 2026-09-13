import {
  multiToolEras,
  type CrossToolSnapshot,
  type EraOverlap,
  type ToolDef,
} from '../../../api/_crossTool';
import { Panel, Kpi } from '@/components/admin/ui';
import { ToolVenn } from '@/components/admin/charts/ToolVenn';
import { colorOf, inclusive } from '@/components/admin/charts/vennAreas';

function fmtPct(pct: number | null): string {
  return pct === null ? '–' : `${pct}%`;
}

function ToolLegend({ catalog, regions }: { catalog: ToolDef[]; regions: Record<string, number> }) {
  return (
    <div
      data-testid="cross-tool-legend"
      className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[0.7rem] font-semibold text-muted-foreground"
    >
      {catalog.map((t, i) => (
        <span key={t.id} className="inline-flex items-center gap-1.5 tabular-nums">
          <span className="inline-block size-2 rounded-full" style={{ background: colorOf(t.id, i) }} />
          {t.short} {inclusive(t.id, regions)}
        </span>
      ))}
    </div>
  );
}

function EraVenn({ era, catalog }: { era: EraOverlap; catalog: ToolDef[] }) {
  return (
    <div className="min-w-0">
      <ToolVenn era={era} catalog={catalog} />
      <ToolLegend catalog={catalog} regions={era.regions} />
    </div>
  );
}

/**
 * Opportunity conversion, companion share, league⊂dex, and arrival-era Venns.
 */
export function CrossToolCard({ data }: { data: CrossToolSnapshot }) {
  const browsers = data.eras.reduce((n, e) => n + e.browsers, 0);
  const eras = multiToolEras(data.eras);
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
      <div
        data-testid="cross-tool-venns"
        className={
          eras.length > 1 ? 'mt-3 grid grid-cols-2 gap-x-2 gap-y-3 md:gap-x-6' : 'mt-3'
        }
      >
        {eras.map((era) => (
          <EraVenn key={era.key} era={era} catalog={data.catalog} />
        ))}
      </div>
    </Panel>
  );
}
