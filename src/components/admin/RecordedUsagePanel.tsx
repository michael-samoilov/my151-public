import {useState} from 'react';
import type {RecordedDistribution, RecordedUsageSlice} from '../../../api/_dashboard';
import {Seg} from './ui';
import {RecordedDistributionChart} from './charts/RecordedDistributionChart';
import {WeeklyRecordedChart} from './charts/WeeklyRecordedChart';

function Distribution({metric, minutes}: {metric: RecordedDistribution; minutes: boolean}) {
  if (!metric.n) return <p className="text-xs text-muted-foreground">No dated {minutes ? 'durations' : 'sessions'} recorded.</p>;
  const format = (v: number | null) => v === null ? '—' : (minutes ? v / 60_000 : v).toLocaleString(undefined, {maximumFractionDigits: 1});
  return <div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
      <span>Average {format(metric.average)}</span><span>Median {format(metric.median)}</span><span>{metric.n} browsers</span>
    </div>
    <RecordedDistributionChart values={metric.values} minutes={minutes} />
    <p className="text-xs text-muted-foreground">Cumulative share of browsers · {minutes ? 'minutes' : 'sessions'} · compressed logarithmic axis</p>
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
    {data.weekly !== undefined && <div className="space-y-1">
      <h3 className="text-xs font-semibold">Weekly recorded hours</h3>
      <WeeklyRecordedChart weeks={data.weekly} />
    </div>}
    <p className="text-xs text-muted-foreground">Retained dated history · {data.browsers} non-bounced browsers · {data.incompleteHistory} with incomplete history · {data.missingTime} without dated durations · {data.missingSessions} without dated sessions</p>
    <p className="text-xs text-muted-foreground">Session-span estimates · retained history · not complete lifetime totals or active attention</p>
  </div>;
}
