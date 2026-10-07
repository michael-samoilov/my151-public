import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ROLLING_RANGES, TOOL_LAUNCHES, type DashboardRange, type RollingRange } from '../../../api/_range';

const LABEL: Record<RollingRange, string> = {
  '24h': '24h',
  '7d': '7d',
  '28d': '28d',
  '90d': '90d',
  '180d': '180d',
  '365d': '365d',
  all: 'All',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** The launch day in the viewer's time zone: `7 Sep`. */
function launchDay(at: number): string {
  const d = new Date(at);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'min-w-0 flex-1 whitespace-nowrap rounded-full border py-1 text-[0.7rem] font-semibold tabular-nums transition-colors md:flex-none md:px-3',
        on ? 'border-foreground bg-foreground text-card' : 'border-border text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

/**
 * The date range every admin chart follows: the rolling windows, then one
 * chip per later tool that opens at its launch. Phones put the launch chips
 * on a second row; desktop keeps one row with a rule between the two sets.
 */
export function RangeRibbon({ value, onChange }: { value: DashboardRange; onChange: (next: DashboardRange) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex flex-col gap-1 px-2 pt-2 md:flex-row md:px-4">
      <div className="flex gap-1">
        {ROLLING_RANGES.map((r) => (
          <Chip key={r} on={r === value} onClick={() => onChange(r)}>
            {LABEL[r]}
          </Chip>
        ))}
      </div>
      {TOOL_LAUNCHES.length > 0 && (
        <div className="flex gap-1 md:ml-1 md:border-l md:border-border md:pl-2">
          {TOOL_LAUNCHES.map((l) => (
            <Chip key={l.range} on={l.range === value} onClick={() => onChange(l.range)}>
              {l.short} <span className="font-normal">{launchDay(l.at)}</span>
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}
