import { cn } from '@/lib/utils';
import {
  phoneFunnelRows,
  phoneReferrerRows,
  type FunnelLink,
  type FunnelNode,
  type FunnelRole,
} from '@/lib/usageFunnels';

const ROLE_COLOR: Record<FunnelRole, string> = {
  success: 'var(--color-success)',
  sink: 'var(--color-sink)',
  priv: 'var(--color-priv)',
  neutral: 'var(--color-foreground)',
};

function Bar({ share, role, className }: { share: number; role: FunnelRole; className?: string }) {
  return (
    <span className={cn('block h-2 overflow-hidden rounded-full bg-muted', className)}>
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(4, Math.round(share * 100))}%`, backgroundColor: ROLE_COLOR[role] }}
      />
    </span>
  );
}

/** Phone usage funnel: one labeled bar per stage, peels under their parent.
 *  HTML so names wrap in the column instead of sitting on a sideways Sankey. */
export function PhoneFunnel({
  nodes,
  links,
  ariaLabel,
}: {
  nodes: FunnelNode[];
  links: FunnelLink[];
  ariaLabel: string;
}) {
  const rows = phoneFunnelRows(nodes, links);
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div role="img" aria-label={ariaLabel} className="flex min-w-0 flex-col gap-2">
      {rows.map((r) => (
        <div key={`${r.depth}-${r.name}`} className="min-w-0" style={{ paddingLeft: `${r.depth * 0.7}rem` }}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2">
            <span className="min-w-0 text-[0.75rem] font-semibold leading-tight break-words">{r.name}</span>
            <span className="shrink-0 text-[0.75rem] font-bold tabular-nums">{r.value}</span>
          </div>
          <Bar share={r.value / max} role={r.role} />
        </div>
      ))}
    </div>
  );
}

/** Phone referrer split: one wrapping host name, then Dex / League bars. */
export function PhoneReferrer({
  links,
  ariaLabel,
}: {
  links: FunnelLink[];
  ariaLabel: string;
}) {
  const rows = phoneReferrerRows(links);
  const max = Math.max(1, ...rows.flatMap((r) => [r.dex, r.league]));
  return (
    <div role="img" aria-label={ariaLabel} className="flex min-w-0 flex-col gap-3">
      {rows.map((r) => {
        const both = r.dex > 0 && r.league > 0;
        return (
          <div key={r.host} className="min-w-0">
            <div className="text-[0.75rem] font-semibold leading-tight break-words">{r.host}</div>
            <div className={cn('mt-1 gap-2', both ? 'grid grid-cols-2' : 'flex')}>
              {r.dex > 0 && (
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-baseline justify-between gap-1">
                    <span className="text-[0.65rem] font-semibold text-muted-foreground">Dex</span>
                    <span className="text-[0.7rem] font-bold tabular-nums">{r.dex}</span>
                  </div>
                  <Bar share={r.dex / max} role="success" />
                </div>
              )}
              {r.league > 0 && (
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-baseline justify-between gap-1">
                    <span className="text-[0.65rem] font-semibold text-muted-foreground">League</span>
                    <span className="text-[0.7rem] font-bold tabular-nums">{r.league}</span>
                  </div>
                  <Bar share={r.league / max} role="priv" />
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
