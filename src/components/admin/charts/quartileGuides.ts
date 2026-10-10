import type {CustomSeriesRenderItemAPI} from 'echarts';

export interface ChartQuartile {
  percentile: number;
  value: number;
  axisValue?: number;
}

/** Shared percentile guides for empirical survival charts, in their axis coordinates. */
export function quartileGuideSeries(quartiles: ChartQuartile[], xMin: number, xMax: number, color: string, format: (value: number) => string, background = '#fff') {
  const ctx = document.createElement('canvas').getContext('2d');
  if (ctx) ctx.font = '9px sans-serif';
  return {
    type: 'custom' as const, silent: true, clip: false, z: 5,
    data: quartiles.map(({percentile,value,axisValue}) => [axisValue ?? value,(1-percentile)*100,percentile,value]),
    renderItem: (_params: unknown, api: CustomSeriesRenderItemAPI) => {
      const pos = api.coord([api.value(0),api.value(1)]);
      const left = api.coord([xMin,api.value(1)]), bottom = api.coord([api.value(0),0]);
      const right = api.coord([xMax,0])[0];
      const text = `${Number(api.value(2))*100}p`;
      const value = format(Number(api.value(3)));
      const textWidth = (ctx?.measureText(`${text} ${value}`).width ?? 70)+8;
      return {type: 'group' as const, children: [
        {type: 'polyline' as const, shape: {points: [left,pos,bottom]}, style: {stroke: color,lineWidth: 1,lineDash: [3,3],opacity: 0.45,fill: null}},
        {type: 'text' as const,x: Math.min(pos[0]+4,right-textWidth),y: pos[1]-4,
          style: {text: `{p|${text}} {v|${value}}`,fill: color,backgroundColor: background,padding: [1,2],fontSize: 9,verticalAlign: 'bottom' as const,
            rich: {p: {fontSize: 9,fontWeight: 600},v: {fontSize: 9}}}},
      ]};
    },
  };
}
