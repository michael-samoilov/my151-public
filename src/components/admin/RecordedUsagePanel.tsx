import {useState} from 'react';
import type {RecordedDistribution, RecordedUsageSlice, RecordedUsage} from '../../../api/_dashboard';
import {Seg} from './ui';
import {RecordedDistributionChart} from './charts/RecordedDistributionChart';
import {colorOf} from './charts/eulerLayout';
import {WeeklyRecordedChart} from './charts/WeeklyRecordedChart';

function Distribution({metric, minutes}: {metric: RecordedDistribution; minutes: boolean}) {
  if (!metric.n) return <p className="text-xs text-muted-foreground">No dated {minutes ? 'durations' : 'sessions'} recorded.</p>;
  const format = (v: number | null) => v === null ? '—' : (minutes ? v / 60_000 : v).toLocaleString(undefined, {maximumFractionDigits: 1});
  return <div>
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs tabular-nums">
      <span>Average {format(metric.average)}</span><span>Median {format(metric.median)}</span><span>{metric.n} browsers</span>
    </div>
    <RecordedDistributionChart values={metric.values} minutes={minutes} />
    <p className="text-xs text-muted-foreground">Browsers at or above each threshold · logarithmic {minutes ? 'time scale · m = minutes · h = hours' : 'session scale'}</p>
  </div>;
}

const toolNames = [{key:'dex',name:'Dex'},{key:'league',name:'League'},{key:'favorites',name:'Picker'}] as const;

function Coverage({data}: {data:RecordedUsageSlice}) {
  return <p className="text-xs text-muted-foreground">Retained dated history · {data.browsers} non-bounced browsers · {data.incompleteHistory} with incomplete history · {data.missingTime} without dated durations · {data.missingSessions} without dated sessions</p>;
}

function emptyMeasured(data:RecordedUsageSlice):RecordedUsageSlice {
  const empty={n:0,total:0,average:null,median:null,values:[]};
  return {...data,time:empty,sessions:empty,weekly:[],missingTime:data.browsers,missingSessions:data.browsers,incompleteHistory:0};
}

export function RecordedUsagePanel({data:legacy, tools:legacyTools,active,activeTools}: {data: RecordedUsageSlice; tools?: RecordedUsage;active?:RecordedUsageSlice;activeTools?:RecordedUsage}) {
  const [source,setSource]=useState<'active'|'legacy'>('active');
  const data=source==='active'?(active??emptyMeasured(legacy)):legacy;
  const tools=legacyTools?(source==='active'?(activeTools??{all:emptyMeasured(legacyTools.all),dex:emptyMeasured(legacyTools.dex),league:emptyMeasured(legacyTools.league),favorites:emptyMeasured(legacyTools.favorites)}):legacyTools):undefined;
  const [metric, setMetric] = useState<'time' | 'sessions'>('time');
  const [scope,setScope] = useState<'overall'|'tools'>('overall');
  const overlay = tools && scope==='tools';
  const series = overlay ? toolNames.map(({key,name},i)=>({name,color:colorOf(key,i),values:tools[key][metric].values})) : undefined;
  const weekSeries = overlay ? toolNames.map(({key,name},i)=>({name,color:colorOf(key,i),weeks:tools[key].weekly??[]})) : undefined;
  return <div className="space-y-3">
    <Seg ariaLabel="Recorded source" options={[{key:'active',label:'Active'},{key:'legacy',label:'Legacy spans'}]} value={source} onChange={setSource} />
    <p className="text-xs text-muted-foreground">{source==='active'?'Foreground interaction estimate · gaps of 5 minutes end sessions · terminal idle and background time excluded':'Legacy session-span estimates · 30-minute session gap · includes idle between snapshots'}</p>
    {source==='active' && !data[metric].n && <p className="text-xs text-muted-foreground">Active time collection starts with new activity. No measured {metric==='time'?'time':'sessions'} recorded in the selected range.</p>}
    {tools && <Seg ariaLabel="Recorded scope" options={[{key:'overall',label:'Overall'},{key:'tools',label:'Tools'}]} value={scope} onChange={setScope} />}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-sm font-semibold tabular-nums">{overlay ? `Recorded ${metric === 'time' ? 'hours' : 'sessions'} by tool` : metric === 'time' ? `${(data.time.total / 3_600_000).toLocaleString(undefined, {maximumFractionDigits: 2})} recorded hours` : `${data.sessions.total.toLocaleString()} recorded sessions`}</span>
      <Seg ariaLabel="Recorded metric" options={[{key: 'time', label: 'Time'}, {key: 'sessions', label: 'Sessions'}]} value={metric} onChange={setMetric} />
    </div>
    {overlay ? <div className="space-y-2">
      <div className="space-y-2">
        {toolNames.map(({key,name},i)=>{
          const m=tools[key][metric];
          const format=(v:number|null)=>v===null?'—':(metric==='time'?v/60_000:v).toLocaleString(undefined,{maximumFractionDigits:1});
          return <div key={key} className="text-xs tabular-nums" data-recorded-tool={key}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="inline-flex items-center gap-1 font-semibold"><span className="h-0.5 w-3" style={{backgroundColor:colorOf(key,i)}} />{name}</span>
              <span>{metric==='time'?`${(m.total/3_600_000).toLocaleString(undefined,{maximumFractionDigits:2})} recorded hours`:`${m.total.toLocaleString()} recorded sessions`}</span>
              <span>Average {format(m.average)}</span><span>Median {format(m.median)}</span><span>{m.n} browsers</span>
            </div>
          </div>;
        })}
      </div>
      {series!.some(s=>s.values.length) ? <RecordedDistributionChart values={[]} minutes={metric==='time'} series={series} /> : <p className="text-xs text-muted-foreground">No dated {metric==='time'?'durations':'sessions'} recorded.</p>}
      <p className="text-xs text-muted-foreground">Browsers at or above each threshold · logarithmic {metric==='time'?'time scale · m = minutes · h = hours':'session scale'}</p>
    </div> : <Distribution metric={data[metric]} minutes={metric === 'time'} />}
    {data.weekly !== undefined && <div className="space-y-1">
      <h3 className="text-xs font-semibold">Weekly recorded hours</h3>
      <WeeklyRecordedChart weeks={data.weekly} series={weekSeries} />
    </div>}
    {overlay ? <div className="space-y-1">{toolNames.map(({key,name})=><div key={key}><span className="text-xs font-semibold">{name}</span><Coverage data={tools[key]} /></div>)}</div> : <Coverage data={data} />}
    <p className="text-xs text-muted-foreground">{source==='active'?'Recorded foreground intervals · retained history · activity intervals under 5 minutes are counted between interactions':'Session-span estimates · retained history · not complete lifetime totals or active attention'}</p>
  </div>;
}
