import type {RecordedWeek} from '../../../../api/_dashboard';
import {cssVar,useECharts,type EChartsOption} from './useECharts';

const date = (ts:number) => new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const hours = (ms:number) => (ms/3_600_000).toLocaleString(undefined,{maximumFractionDigits:2});
export interface RecordedWeekSeries {name:string; color:string; weeks:RecordedWeek[]}
export function WeeklyRecordedChart({weeks,series}: {weeks:RecordedWeek[];series?:RecordedWeekSeries[]}) {
  const pooled = new Map<number,RecordedWeek>();
  for (const s of series ?? []) for (const w of s.weeks) {
    const old = pooled.get(w.week);
    const start = Math.min(old?.start ?? w.start,w.start), end = Math.max(old?.end ?? w.end,w.end);
    pooled.set(w.week,{...w,start,end,partial:start>w.week || end<w.week+7*86_400_000});
  }
  const timeline = series ? [...pooled.values()].sort((a,b)=>a.week-b.week) : weeks;
  const atWeek = (s:RecordedWeekSeries,i:number) => s.weeks.find(w=>w.week===timeline[i].week);

  const ref=useECharts((el):EChartsOption=>{
    const ink=cssVar(el,'--color-foreground','#0a0a0a');
    const faint=cssVar(el,'--color-muted-foreground','#737373');
    return {
      animation:false,grid:{left:40,right:16,top:20,bottom:26},
      xAxis:{type:'category',boundaryGap:false,data:timeline.map(w=>date(w.week)),axisTick:{show:false},axisLine:{show:false},
        axisLabel:{color:faint,fontSize:9,hideOverlap:true,formatter:(_label:string,i:number)=>`${new Date(timeline[i].week).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'})}${timeline[i].partial?'*':''}`}},
      yAxis:{type:'value',min:0,splitLine:{show:false},axisLabel:{color:faint,fontSize:9}},
      series:series ? series.map(s=>({name:s.name,type:'line',smooth:false,data:timeline.map((_,i)=>{const w=atWeek(s,i);return w ? w.totalMs/3_600_000 : null;}),symbolSize:5,showSymbol:s.weeks.length<12,lineStyle:{color:s.color,width:2},itemStyle:{color:s.color}})) : [{type:'line',smooth:false,data:timeline.map(w=>w.totalMs/3_600_000),symbolSize:5,showSymbol:timeline.length<12,
        lineStyle:{color:ink,width:2},itemStyle:{color:ink}}],
    };
  },[weeks,series],{scrub:{count:timeline.length,label:i=>[`${date(timeline[i].start)} – ${date(timeline[i].end)} UTC${timeline[i].partial?' (partial week)':''}`,...(series ? series.map(s=>`${s.name}: <b>${atWeek(s,i) ? hours(atWeek(s,i)!.totalMs) : '—'} recorded hours</b>${atWeek(s,i)?.partial ? ' (partial week)' : ''}`) : [`<b>${hours(timeline[i].totalMs)} recorded hours</b>`])]}});
  if (!timeline.length) return <p className="text-xs text-muted-foreground">No dated durations recorded.</p>;
  return <div>
    <div ref={ref} className="h-[160px] w-full md:h-[180px]" role="img" aria-label={series ? `Weekly recorded hours by tool: ${series.map(s=>`${s.name} ${hours(s.weeks.reduce((sum,w)=>sum+w.totalMs,0))} hours`).join('; ')}; ${timeline.length} Monday UTC weeks.` : `Weekly recorded hours: ${timeline.length} Monday UTC weeks, ${timeline.filter(w=>w.partial).length} partial weeks; total ${hours(weeks.reduce((sum,w)=>sum+w.totalMs,0))} hours.`} />
    <p className="text-xs text-muted-foreground">Monday weeks · UTC{timeline.some(w=>w.partial)?' · * Partial week':''}</p>
  </div>;
}
