import type { ReactNode } from 'react';

function RailStat({ top, bottom, width, full }: { top: ReactNode; bottom: ReactNode; width: string; full?: boolean }) {
  return (
    <div
      data-testid="admin-rail-chip"
      className={`flex h-9 shrink-0 flex-col items-center justify-center rounded-lg border border-border bg-card px-2 text-center tabular-nums ${full ? 'flex-1' : width}`}
    >
      <div className="flex h-[16px] items-center leading-none whitespace-nowrap">{top}</div>
      <div className="flex h-[11px] items-center whitespace-nowrap text-[0.6rem] leading-none text-muted-foreground">{bottom}</div>
    </div>
  );
}
export function SessionsChip({ sessions, days, full }: { sessions: number; days: number; full?: boolean }) {
  return (
    <RailStat
      width="w-[82px] md:w-[8.5rem]"
      full={full}
      top={
        <>
          <span className="text-sm font-bold leading-none">{sessions}</span>&nbsp;<span className="text-[0.6rem] leading-none text-muted-foreground">{sessions === 1 ? 'session' : 'sessions'}</span>
        </>
      }
      bottom={days === 1 ? '1 day' : `${days} days`}
    />
  );
}
export function TimeChip({ ms, full }: { ms: number; full?: boolean }) {
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return <RailStat width="w-[82px] md:w-[8.5rem]" full={full} top={<span className="text-[0.8rem] font-bold leading-none">{h > 0 ? `${h}h ${m}m` : `${m}m`}</span>} bottom="time spent" />;
}
