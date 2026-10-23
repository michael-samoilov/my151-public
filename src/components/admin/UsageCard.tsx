import { Fragment, useEffect, useState, type ReactNode } from 'react';
import { Panel, Kpi } from '@/components/admin/ui';

type Point = { x: string; y: number };
type Stats = {
  total_monthly_requests?: number;
  total_monthly_bandwidth?: number;
  total_monthly_billing?: number;
  current_storage?: number;
  days?: string[];
  dailyrequests?: Point[];
  bandwidths?: Point[];
  dailybilling?: Point[];
  command_counts?: { metric_identifier: string; data_points: Point[] }[];
};
type ActivityBudget = {status: 'collecting' | 'paused' | 'disabled'; usedUnits: number; limitUnits: number; bytes: number; limitBytes: number; acceptedBuckets: number; pausedUntil?: number} | {status: 'error'};
type Usage = ({ status: 'ready'; stats: Stats } | { status: 'not_configured' } | { status: 'error'; http: number }) & {activity?: ActivityBudget};

const fmt = new Intl.NumberFormat('en-US');
const gb = (bytes = 0) => `${(bytes / 1e9).toFixed(2)} GB`;

function Row({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  return (
    <>
      <span className="truncate font-medium text-muted-foreground">{label}</span>
      <span className="h-2 rounded-full bg-muted">
        <span className="block h-2 rounded-full bg-foreground/70" style={{ width: `${max > 0 ? (value / max) * 100 : 0}%` }} />
      </span>
      <span className="text-right font-semibold">{text}</span>
    </>
  );
}

function Title({ children }: { children: ReactNode }) {
  return <div className="col-span-3 mt-2 text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground first:mt-0">{children}</div>;
}

function ActivityStatus({budget}: {budget?: ActivityBudget}) {
  if (!budget) return null;
  if (budget.status === 'error') return <p className="mt-4 text-xs text-muted-foreground">Minute history status unavailable</p>;
  return <div className="mt-4 border-t pt-3 text-xs text-muted-foreground" data-testid="activity-budget">
    <p className="font-semibold text-foreground">Minute history · {budget.status}</p>
    <details className="mt-1">
    <summary className="w-fit cursor-pointer">Details</summary>
    <p className="mt-1">{fmt.format(budget.acceptedBuckets)} recorded minute fragments · retained for 400 days</p>
    <p className="mt-1">Monthly allowance: {fmt.format(budget.usedUnits)} / {fmt.format(budget.limitUnits)} operation units · {(budget.bytes / 1048576).toFixed(1)} / {(budget.limitBytes / 1048576).toFixed(0)} MB</p>
    <p className="mt-1">Conservative allowance including retries; separate from the actual bill and stored size. Supports session cutoffs of 1 minute or longer.</p>
    {budget.status === 'disabled' && <p className="mt-1">Collection resumes when enabled.</p>}
    {budget.status === 'paused' && budget.pausedUntil && <p className="mt-1">Collection resumes after {new Date(budget.pausedUntil).toISOString().slice(0, 10)} UTC.</p>}
    </details>
  </div>;
}

export function UsageCard({ token }: { token: string }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  useEffect(() => {
    let live = true;
    fetch('/api/submissions?usage=1&activity=1', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? (r.json() as Promise<Usage>) : { status: 'error' as const, http: r.status }))
      .catch(() => ({ status: 'error' as const, http: 0 }))
      .then((u) => live && setUsage(u));
    return () => {
      live = false;
    };
  }, [token]);

  if (!usage) return null;
  if (usage.status !== 'ready') {
    return (
      <Panel title="Database" sub={['upstash']}>
        <p className="text-xs text-muted-foreground">{usage.status === 'not_configured' ? 'Not connected' : `Upstash error ${usage.http}`}</p>
        <ActivityStatus budget={usage.activity} />
      </Panel>
    );
  }
  const s = usage.stats;
  const days = (s.dailyrequests ?? []).map((p, i) => ({
    label: `${s.days?.[i]?.slice(0, 3) ?? ''} ${p.x.slice(5, 10).replace('-', '/')}`,
    commands: p.y,
    bytes: s.bandwidths?.[i]?.y ?? 0,
    usd: s.dailybilling?.[i]?.y ?? 0,
  }));
  // Upstash fills in a day's total after the day ends, so today reads 0
  // until then; today's commands so far are in the list below.
  if (days.at(-1)?.commands === 0) days.pop();
  const maxDay = Math.max(0, ...days.map((d) => d.commands));
  const today = (s.command_counts ?? [])
    .map((c) => ({ name: c.metric_identifier, n: c.data_points.at(-1)?.y ?? 0 }))
    .filter((c) => c.n > 0)
    .sort((a, b) => b.n - a.n);
  const maxCmd = Math.max(0, ...today.map((c) => c.n));
  return (
    <Panel title="Database" sub={['upstash', 'this month']}>
      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <Kpi value={fmt.format(s.total_monthly_requests ?? 0)} label="Commands" />
        <Kpi value={`$${(s.total_monthly_billing ?? 0).toFixed(2)}`} label="Billed" />
        <Kpi value={gb(s.total_monthly_bandwidth)} label="Bandwidth" />
        <Kpi value={`${((s.current_storage ?? 0) / 1e6).toFixed(1)} MB`} label="Storage" />
      </div>
      <div className="mt-4 grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-2 gap-y-1.5 text-xs tabular-nums">
        <Title>Commands per day (UTC)</Title>
        <div className="contents" data-testid="usage-days">
          {days.map((d) => (
            <Fragment key={d.label}>
              <Row label={d.label} value={d.commands} max={maxDay} text={fmt.format(d.commands)} />
              <span className="col-span-2 col-start-2 -mt-1 text-[0.65rem] text-muted-foreground">{`${gb(d.bytes)} · $${d.usd.toFixed(2)}`}</span>
            </Fragment>
          ))}
        </div>
        {today.length > 0 && <Title>Today by command (UTC)</Title>}
        <div className="contents" data-testid="usage-commands">
          {today.map((c) => (
            <Row key={c.name} label={c.name} value={c.n} max={maxCmd} text={fmt.format(c.n)} />
          ))}
        </div>
      </div>
      <ActivityStatus budget={usage.activity} />
    </Panel>
  );
}
