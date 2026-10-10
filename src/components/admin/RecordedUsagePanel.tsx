import {useState} from 'react';
import type {RecordedDistribution, RecordedUsageSlice} from '../../../api/_dashboard';
import {Seg} from './ui';
import {SuperimposedHistogram} from '@/components/analytics/SuperimposedHistogram';

function Distribution({metric, minutes}: {metric: RecordedDistribution; minutes: boolean}) {
  if (!metric.n) return <p className="text-xs text-muted-foreground">No dated {minutes ? 'durations' : 'sessions'} recorded.</p>;
  const values = metric.values.map(v => minutes ? v / 60_000 : v);
  const max = Math.max(1, ...values);
  const step = minutes ? Math.max(1, Math.ceil(max / 8)) : Math.max(1, Math.ceil((max + 1) / 8));
  const count = Math.ceil((max + 1) / step);
  const bins = Array.from({length: count}, (_, i) => ({x: i * step + step / 2,
    nationalPct: values.filter(v => Math.floor(v / step) === i).length / metric.n * 100, yoursPct: 0}));
  const yMax = Math.max(10, Math.ceil(Math.max(...bins.map(b => b.nationalPct)) / 10) * 10);
  const format = (v: number | null) => v === null ? '—' : (minutes ? v / 60_000 : v).toLocaleString(undefined, {maximumFractionDigits: 1});
  return <div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
      <span>Average {format(metric.average)}</span><span>Median {format(metric.median)}</span><span>{metric.n} browsers</span>
    </div>
    <div role="img" aria-label={`${minutes ? 'Recorded minutes' : 'Recorded sessions'} per non-bounced browser; sample ${metric.n}`}>
      <SuperimposedHistogram data={bins} binSize={step} xDomain={[0, count * step]}
        xTicks={Array.from({length: Math.min(5, count + 1)}, (_, i) => Math.round(i * count / Math.min(4, count)) * step)}
        yDomain={yMax} yTicks={[0, yMax / 2, yMax]} heightScale={0.75} />
    </div>
    <p className="text-xs text-muted-foreground">{minutes ? 'Recorded minutes' : 'Recorded sessions'} per browser · % of sample</p>
  </div>;
}

export function RecordedUsagePanel({data}: {data: RecordedUsageSlice}) {
  const [metric, setMetric] = useState<'time' | 'sessions'>('time');
  return <div className="space-y-3">
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold tabular-nums">{metric === 'time' ? `${(data.time.total / 3_600_000).toLocaleString(undefined, {maximumFractionDigits: 2})} recorded hours` : `${data.sessions.total.toLocaleString()} recorded sessions`}</span>
      <Seg ariaLabel="Recorded metric" options={[{key: 'time', label: 'Time'}, {key: 'sessions', label: 'Sessions'}]} value={metric} onChange={setMetric} />
    </div>
    <Distribution metric={data[metric]} minutes={metric === 'time'} />
    <p className="text-xs text-muted-foreground">Retained dated history · {data.browsers} non-bounced browsers · {data.incompleteHistory} with incomplete history · {data.missingTime} without dated durations · {data.missingSessions} without dated sessions</p>
    <p className="text-xs text-muted-foreground">Session-span estimates · retained history · not complete lifetime totals or active attention</p>
  </div>;
}
