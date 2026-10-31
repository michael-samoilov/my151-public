import {useCallback, useMemo} from 'react';
import type {CustomSeriesRenderItemAPI} from 'echarts';
import {percentileAxis, quartileGuideSeries} from './quartileGuides';
import {cssVar, useECharts, type EChartsOption} from './useECharts';

const format = (v: number) => v.toLocaleString(undefined, {maximumFractionDigits: 1});
const timeLabel = (v: number) => v < 60 ? `${format(v)}m` : `${format(v / 60)}h`;

interface RecordedCurveSeries {name: string; color: string; values: number[]}

function survival(values: number[], minutes: boolean) {
  const sorted = values.map(v => minutes ? v / 60_000 : v).sort((a,b) => a-b);
  const points: number[][] = [[0,100]];
  const thresholds: {value: number; count: number}[] = [];
  let zeros = 0;
  for (let i = 0; i < sorted.length;) {
    const value = sorted[i];
    let end = i + 1;
    while (end < sorted.length && sorted[end] === value) end++;
    points.push([Math.log1p(value),(sorted.length-i) / sorted.length * 100],
      [Math.log1p(value),(sorted.length-end) / sorted.length * 100]);
    thresholds.push({value, count:sorted.length-i});
    if (value === 0) zeros = end;
    i = end;
  }
  return {sorted, points, thresholds, zeros};
}

export function RecordedDistributionChart({values, minutes, series}: {values: number[]; minutes: boolean; series?: RecordedCurveSeries[]}) {
  const {sorted, points, thresholds, zeros, curves, scrubThresholds, max, quartiles} = useMemo(() => {
    const {sorted, points, thresholds, zeros} = survival(values, minutes);
    const curves = series?.map(s => ({...s,...survival(s.values,minutes)}));
    const allValues = curves ? curves.flatMap(s=>s.sorted) : sorted;
    const scrubThresholds = curves ? [...new Set(allValues)].sort((a,b)=>a-b) : thresholds.map(p=>p.value);
    const max = allValues.reduce((largest,value)=>Math.max(largest,value),0);
    const quartiles = [0.25,0.5,0.75].map(q => ({q,value:sorted[Math.min(sorted.length-1,Math.floor(q*sorted.length))] ?? 0}));
    return {sorted, points, thresholds, zeros, curves, scrubThresholds, max, quartiles};
  }, [values,minutes,series]);
  const unit = minutes ? 'minutes' : 'sessions';
  const display = minutes ? timeLabel : format;
  const build = useCallback((el: HTMLDivElement): EChartsOption => {
    const ink = cssVar(el,'--color-foreground','#0a0a0a');
    const faint = cssVar(el,'--color-muted-foreground','#737373');
    const grid = cssVar(el,'--color-muted','#f5f5f5');
    const card = cssVar(el,'--color-card','#fff');
    const candidates = minutes ? [0,1,2,5,10,15,30,60,120,240,480,720,1440,2880,10080]
      : [0,1,2,5,10,20,50,100,200,500,1000];
    const axisEnd = candidates.find(v => v >= Math.max(1,max)) ??
      Math.ceil(max / candidates.at(-1)!) * candidates.at(-1)!;
    const xMax = Math.log1p(axisEnd);
    const ticks: number[] = [];
    const width = Math.max(1,el.clientWidth-56);
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx) ctx.font = '9px sans-serif';
    const labelWidth = (v: number) => ctx?.measureText(display(v)).width ?? 24;
    for (const v of candidates.filter(v => v < axisEnd)) {
      const previous = ticks.at(-1);
      if (previous === undefined || (Math.log1p(v)-Math.log1p(previous)) / xMax * width >=
        (labelWidth(previous)+labelWidth(v))/2+10) ticks.push(v);
    }
    while (ticks.length > 1 && (xMax-Math.log1p(ticks.at(-1)!)) / xMax * width <
      labelWidth(axisEnd)+labelWidth(ticks.at(-1)!)/2+8) ticks.pop();
    ticks.push(axisEnd);
    return {
      animation:false,
      grid:{left:40,right:16,top:20,bottom:26},
      tooltip:{show:false},
      xAxis:{type:'value',min:0,max:xMax,axisLabel:{show:false},axisTick:{show:false},splitLine:{show:false},axisLine:{lineStyle:{color:grid}}},
      yAxis:percentileAxis(faint),
      series:[
        ...(curves ? curves.filter(s=>s.sorted.length).map(s=>({name:s.name,type:'line' as const,data:[...s.points,[xMax,0]],smooth:false,symbol:'none',lineStyle:{color:s.color,width:2}})) : [{type:'line' as const,data:[...points,[xMax,0]],smooth:false,symbol:'none',lineStyle:{color:ink,width:2},areaStyle:{color:ink,opacity:0.04}}]),
        quartileGuideSeries((curves ? [] : quartiles).map(({q,value})=>({percentile:q,value,axisValue:Math.log1p(value)})),0,xMax,faint,display,card),
        {type:'custom',silent:true,clip:false,data:ticks.map(v=>[Math.log1p(v),0,v]),
          renderItem:(_params: unknown,api:CustomSeriesRenderItemAPI)=>{
            const v=Number(api.value(2));
            const pos=api.coord([api.value(0),0]);
            return {type:'group',children:[
              {type:'line',shape:{x1:pos[0],y1:pos[1],x2:pos[0],y2:pos[1]+4},style:{stroke:faint,lineWidth:1}},
              {type:'text',x:pos[0],y:pos[1]+9,style:{text:display(v),fill:faint,fontSize:9,align:v===0?'left':v===axisEnd?'right':'center',verticalAlign:'top'}},
            ]};
          }},
      ],
    };
  },[minutes,max,display,curves,points,quartiles]);
  const ref = useECharts(build,{scrub:{count:scrubThresholds.length,xValues:scrubThresholds.map(v=>Math.log1p(v)),label:index=>{
    if (curves) {
      const value = scrubThresholds[index];
      return [`≥ ${minutes ? timeLabel(value) : `${format(value)} sessions`}`, ...curves.map(s=>{
        const count=s.sorted.filter(v=>v>=value).length;
        return `${s.name}: <b>${s.sorted.length ? `${format(count/s.sorted.length*100)}%` : '—'}</b> (${count} of ${s.sorted.length} browsers)`;
      })];
    }
    const point=thresholds[index];
    return [`≥ ${minutes ? timeLabel(point.value) : `${format(point.value)} sessions`}`,
      `<b>${format(point.count / sorted.length * 100)}%</b> of browsers (${point.count} of ${sorted.length})`];
  }}});
  return <div ref={ref} className="h-[200px] w-full md:h-[240px]" role="img"
    aria-label={curves ? `Recorded ${unit} retention by tool: ${curves.map(s=>`${s.name} ${s.sorted.length} browsers, maximum ${display(s.sorted.at(-1)??0)}`).join('; ')}. At least the selected threshold. Compressed logarithmic axis in original units.` : `Recorded ${unit} retention: ${sorted.length} browsers, ${zeros} at zero, maximum ${format(max)} ${unit}. At least the selected threshold. Quartiles ${quartiles.map(({q,value})=>`${q*100}p ${display(value)}`).join(', ')}. Compressed logarithmic axis in original units.`} />;
}
