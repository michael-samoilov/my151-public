import { useMemo, useState } from 'react';
import type { CrossToolSnapshot } from '../../../api/_crossTool';
import { Panel } from '@/components/admin/ui';
import { ToolEuler } from '@/components/admin/charts/ToolEuler';
import { cn } from '@/lib/utils';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

function launchDay(ts: number): string {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function CrossToolCard({ data, since }: { data: CrossToolSnapshot; since?: Record<string, CrossToolSnapshot> }) {
  const [pick, setPick] = useState<string | null>(null);
  const chips = data.catalog.filter(
    (t, i): t is typeof t & { launchedAt: number } => i > 0 && t.launchedAt !== null && since?.[t.id] !== undefined,
  );
  const snap = (pick !== null ? since?.[pick] : undefined) ?? data;
  const browsers = snap.eras.reduce((n, e) => n + e.browsers, 0);
  const regions = useMemo(() => {
    const sum: Record<string, number> = {};
    for (const era of snap.eras) for (const [key, n] of Object.entries(era.regions)) sum[key] = (sum[key] ?? 0) + n;
    return sum;
  }, [snap.eras]);
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
      {chips.length > 0 && (
        <div role="group" aria-label="Since launch" className="mb-3 flex gap-1">
          {chips.map((t) => {
            const on = pick === t.id;
            return (
              <button
                key={t.id}
                type="button"
                aria-pressed={on}
                onClick={() => setPick(on ? null : t.id)}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-[0.7rem] font-semibold tabular-nums transition-colors',
                  on ? 'border-foreground bg-foreground text-card' : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {t.short} {launchDay(t.launchedAt)}
              </button>
            );
          })}
        </div>
      )}
      <div data-testid="cross-tool-venns">
        <ToolEuler regions={regions} catalog={data.catalog} />
      </div>
    </Panel>
  );
}
