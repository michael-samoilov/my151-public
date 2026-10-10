import type {RecordedWeek} from '../../../../api/_dashboard';
import {cssVar,useECharts,type EChartsOption} from './useECharts';

const date = (ts:number) => new Date(ts).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const hours = (ms:number) => (ms/3_600_000).toLocaleString(undefined,{maximumFractionDigits:2});
export function WeeklyRecordedChart({weeks}: {weeks:RecordedWeek[]}) {
  const ref=useECharts((el):EChartsOption=>{
    const ink=cssVar(el,'--color-foreground','#0a0a0a');
    const faint=cssVar(el,'--color-muted-foreground','#737373');
    return {
      animation:false,grid:{left:40,right:16,top:20,bottom:26},
      xAxis:{type:'category',boundaryGap:false,data:weeks.map(w=>date(w.week)),axisTick:{show:false},axisLine:{show:false},
        axisLabel:{color:faint,fontSize:9,hideOverlap:true,formatter:(_label:string,i:number)=>`${new Date(weeks[i].week).toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'})}${weeks[i].partial?'*':''}`}},
      yAxis:{type:'value',min:0,splitLine:{show:false},axisLabel:{color:faint,fontSize:9}},
      series:[{type:'line',smooth:false,data:weeks.map(w=>w.totalMs/3_600_000),symbolSize:5,showSymbol:weeks.length<12,
        lineStyle:{color:ink,width:2},itemStyle:{color:ink}}],
    };
  },[weeks],{scrub:{count:weeks.length,label:i=>[`${date(weeks[i].start)} – ${date(weeks[i].end)} UTC${weeks[i].partial?' (partial week)':''}`,`<b>${hours(weeks[i].totalMs)} recorded hours</b>`]}});
  if (!weeks.length) return <p className="text-xs text-muted-foreground">No dated durations recorded.</p>;
  return <div>
    <div ref={ref} className="h-[160px] w-full md:h-[180px]" role="img" aria-label={`Weekly recorded hours: ${weeks.length} Monday UTC weeks, ${weeks.filter(w=>w.partial).length} partial weeks; total ${hours(weeks.reduce((sum,w)=>sum+w.totalMs,0))} hours.`} />
    <p className="text-xs text-muted-foreground">Monday weeks · UTC{weeks.some(w=>w.partial)?' · * Partial week':''}</p>
  </div>;
}
