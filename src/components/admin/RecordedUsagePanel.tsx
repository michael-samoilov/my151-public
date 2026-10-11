import {useState} from 'react';
import type {RecordedDistribution, RecordedUsageSlice, RecordedUsage} from '../../../api/_dashboard';
import {Seg} from './ui';
import {RecordedDistributionChart} from './charts/RecordedDistributionChart';
import {colorOf} from './charts/eulerLayout';
import {WeeklyRecordedChart} from './charts/WeeklyRecordedChart';

const toolNames = [{key:'dex',name:'Dex'},{key:'league',name:'League'},{key:'favorites',name:'Picker'}] as const;
const number = (value:number, digits=1) => value.toLocaleString(undefined,{maximumFractionDigits:digits});

function Statistics({metric,minutes}: {metric:RecordedDistribution;minutes:boolean}) {
  const format = (value:number|null) => value===null?'—':minutes?`${number(value/60_000)} min`:number(value);
  return <div className="flex flex-wrap gap-x-4 gap-y-1 tabular-nums">
    <span>Average {format(metric.average)}</span><span>Median {format(metric.median)}</span>
  </div>;
}

function Coverage({data}: {data:RecordedUsageSlice}) {
  return <p>{data.browsers} non-bounced browsers · {data.incompleteHistory} with incomplete history · {data.missingTime} without time · {data.missingSessions} without sessions</p>;
}

function emptyMeasured(data:RecordedUsageSlice):RecordedUsageSlice {
  const empty={n:0,total:0,average:null,median:null,values:[]};
  return {...data,time:empty,sessions:empty,weekly:[],missingTime:data.browsers,missingSessions:data.browsers,incompleteHistory:0};
}

export function RecordedUsagePanel({data:legacy, tools:legacyTools,active,activeTools}: {data: RecordedUsageSlice; tools?: RecordedUsage;active?:RecordedUsageSlice;activeTools?:RecordedUsage}) {
  const [source,setSource]=useState<'active'|'legacy'>('active');
  const data=source==='active'?(active??emptyMeasured(legacy)):legacy;
  const tools=legacyTools?(source==='active'?(activeTools??{all:emptyMeasured(legacyTools.all),dex:emptyMeasured(legacyTools.dex),league:emptyMeasured(legacyTools.league),favorites:emptyMeasured(legacyTools.favorites)}):legacyTools):undefined;
  const [metric,setMetric]=useState<'time'|'sessions'>('time');
  const [scope,setScope]=useState<'overall'|'tools'>('overall');
  const overlay=tools&&scope==='tools';
  const series=overlay?toolNames.map(({key,name},i)=>({name,color:colorOf(key,i),values:tools[key][metric].values})):undefined;
  const weekSeries=overlay?toolNames.map(({key,name},i)=>({name,color:colorOf(key,i),weeks:tools[key].weekly??[]})):undefined;
  const hasValues=overlay?series!.some(s=>s.values.length):data[metric].n>0;
  const hasWeeks=overlay?weekSeries!.some(s=>s.weeks.length):!!data.weekly?.length;
  return <div className="space-y-3">
    <Seg ariaLabel="Recorded source" options={[{key:'active',label:'Active'},{key:'legacy',label:'Legacy spans'}]} value={source} onChange={setSource} />
    <p className="text-xs text-muted-foreground">Idle gaps &lt;{source==='active'?'5':'30'} min between interactions included in session length</p>
    {tools&&<Seg ariaLabel="Recorded scope" options={[{key:'overall',label:'Overall'},{key:'tools',label:'Tools'}]} value={scope} onChange={setScope} />}
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 tabular-nums">
        <span className="text-sm font-semibold">{overlay?`Recorded ${metric==='time'?'hours':'sessions'} by tool`:!hasValues?`No ${metric==='time'?'time':'sessions'} recorded.`:metric==='time'?`${number(data.time.total/3_600_000,2)} recorded hours`:`${data.sessions.total.toLocaleString()} recorded sessions`}</span>
        {!overlay&&hasValues&&<span className="text-xs text-muted-foreground">{data[metric].n} browsers</span>}
      </div>
      <Seg ariaLabel="Recorded metric" options={[{key:'time',label:'Time'},{key:'sessions',label:'Sessions'}]} value={metric} onChange={setMetric} />
    </div>
    {overlay&&<table aria-label="Usage by tool" className="w-full text-xs tabular-nums">
      <thead className="text-muted-foreground"><tr><th className="pb-1 text-left font-medium">Tool</th><th className="pb-1 text-right font-medium">{metric==='time'?'Hours':'Sessions'}</th><th className="pb-1 text-right font-medium">Browsers</th></tr></thead>
      <tbody>{toolNames.map(({key,name},i)=>{
        const m=tools[key][metric];
        return <tr key={key} data-recorded-tool={key}>
          <th scope="row" className="py-0.5 text-left font-medium"><span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3" style={{backgroundColor:colorOf(key,i)}} />{name}</span></th>
          <td className="py-0.5 text-right">{m.n?metric==='time'?number(m.total/3_600_000,2):m.total.toLocaleString():'—'}</td>
          <td className="py-0.5 text-right">{m.n.toLocaleString()}</td>
        </tr>;
      })}</tbody>
    </table>}
    {hasValues&&<RecordedDistributionChart values={overlay?[]:data[metric].values} minutes={metric==='time'} series={series} />}
    {hasWeeks&&<div className="space-y-1"><h3 className="text-xs font-semibold">Weekly recorded hours</h3><WeeklyRecordedChart weeks={data.weekly??[]} series={weekSeries} /></div>}
    <details className="text-xs text-muted-foreground">
      <summary className="w-fit cursor-pointer">Details</summary>
      <div className="mt-2 space-y-2">
        {overlay?toolNames.map(({key,name})=><div key={key}><p className="font-semibold">{name}</p><Statistics metric={tools[key][metric]} minutes={metric==='time'} /><Coverage data={tools[key]} /></div>):<><Statistics metric={data[metric]} minutes={metric==='time'} /><Coverage data={data} /></>}
        <p>Recorded history only. Missing measurements are excluded; this is not a lifetime total.</p>
        <p>Chart: browsers at or above each threshold, on a logarithmic scale. m = minutes; h = hours.</p>
        {hasWeeks&&<p>Weeks start Monday, UTC. * marks a partial week.</p>}
        {source==='active'&&<p>Only foreground interaction intervals count; terminal idle and background time are excluded.</p>}
      </div>
    </details>
  </div>;
}
