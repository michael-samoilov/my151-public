import { cn } from '@/lib/utils';
import { DASHBOARD_RANGES, type DashboardRange } from '../../../api/_range';

const LABEL: Record<DashboardRange, string> = {
  '24h': '24h',
  '7d': '7d',
  '28d': '28d',
  '90d': '90d',
  '180d': '180d',
  '365d': '365d',
  all: 'All',
};

export function RangeRibbon({ value, onChange }: { value: DashboardRange; onChange: (next: DashboardRange) => void }) {
  return (
    <div role="group" aria-label="Date range" className="flex gap-1 px-2 pt-2 md:px-4">
      {DASHBOARD_RANGES.map((r) => {
        const on = r === value;
        return (
          <button
            key={r}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(r)}
            className={cn(
              'min-w-0 flex-1 rounded-full border py-1 text-[0.7rem] font-semibold tabular-nums transition-colors md:flex-none md:px-3',
              on ? 'border-foreground bg-foreground text-card' : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            {LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}
