import type {CustomSeriesRenderItemAPI} from 'echarts';
import {cssVar, tooltipStyle, useECharts, type EChartsOption} from './useECharts';

const format = (v: number) => v.toLocaleString(undefined, {maximumFractionDigits: 1});

/** Exact empirical CDF: tied observations jump together, including zero. */
export function RecordedDistributionChart({values, minutes}: {values: number[]; minutes: boolean}) {
  const sorted = values.map(v => minutes ? v / 60_000 : v).sort((a,b) => a-b);
  const points: number[][] = [[0,0,0,0]];
  let zeros = 0;
  for (let i = 0; i < sorted.length;) {
    const value = sorted[i];
    let end = i + 1;
    while (end < sorted.length && sorted[end] === value) end++;
    points.push([Math.log1p(value),i / sorted.length * 100,value,i], [Math.log1p(value),end / sorted.length * 100,value,end]);
    if (value === 0) zeros = end;
    i = end;
  }
  const max = sorted.at(-1) ?? 0;
  const unit = minutes ? 'minutes' : 'sessions';
  const ref = useECharts((el): EChartsOption => {
    const ink = cssVar(el,'--color-foreground','#0a0a0a');
    const faint = cssVar(el,'--color-muted-foreground','#737373');
    const grid = cssVar(el,'--color-muted','#f5f5f5');
    const xMax = Math.log1p(Math.max(1,max));
    const candidates = (minutes ? [0,1,5,15,60,180,600,1800,6000] : [0,1,2,5,10,30,100,300,1000]).filter(v=>v<max);

    const ticks: number[] = [];
    const width = Math.max(1,el.clientWidth-56);
    for (const v of [...new Set(candidates)]) {
      if (!ticks.length || (Math.log1p(v)-Math.log1p(ticks.at(-1)!)) / xMax * width >= 42) ticks.push(v);
    }
    if (max > 0) {
      if (ticks.length > 1 && (Math.log1p(max)-Math.log1p(ticks.at(-1)!)) / xMax * width < 42) ticks.pop();
      ticks.push(max);
    }
    return {
      animation:false,
      grid:{left:40,right:16,top:20,bottom:26},
      tooltip:{...tooltipStyle(el),trigger:'axis',formatter:(params: {value:number[]}[])=>{
        const point=params.find(p=>p.value.length===4)?.value;
        if (!point) return '';
        // Axis snapping may choose either endpoint of a tied-value jump.
        let low=0,high=sorted.length;
        while (low<high) {const mid=Math.floor((low+high)/2);if (sorted[mid]<=point[2]) low=mid+1;else high=mid;}
        return `≤ ${format(point[2])} ${unit}<br><b>${format(low/sorted.length*100)}%</b> of browsers (${low} of ${sorted.length})`;
      }},
      xAxis:{type:'value',min:0,max:xMax,axisLabel:{show:false},axisTick:{show:false},splitLine:{show:false},axisLine:{lineStyle:{color:grid}}},
      yAxis:{type:'value',min:0,max:100,interval:25,axisLabel:{color:faint,fontSize:9,formatter:'{value}%'},splitLine:{show:false}},
      series:[
        {type:'line',data:points,smooth:false,symbol:'none',lineStyle:{color:ink,width:2},areaStyle:{color:ink,opacity:0.04}},
        {type:'custom',silent:true,clip:false,data:ticks.map(v=>[Math.log1p(v),0,v]),
          renderItem:(_params: unknown,api:CustomSeriesRenderItemAPI)=>{
            const v=Number(api.value(2));
            const pos=api.coord([api.value(0),0]);
            return {type:'text',x:pos[0],y:pos[1]+9,style:{text:format(v),fill:faint,fontSize:9,align:v===0?'left':v===max?'right':'center',verticalAlign:'top'}};
          }},
      ],
    };
  },[values,minutes]);
  return <div ref={ref} className="h-[200px] w-full md:h-[240px]" role="img"
    aria-label={`Cumulative recorded ${unit}: ${sorted.length} browsers, ${zeros} at zero, maximum ${format(max)} ${unit}. Compressed logarithmic axis in original units.`} />;
}
