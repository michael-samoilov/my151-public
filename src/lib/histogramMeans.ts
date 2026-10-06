/** Shared SVG/canvas mean rail: labels face outward; crowded labels use separate rails. */
export function histogramMeans(yours:number,options:number,width:number,position:(value:number)=>number,labels:{yours:string;options:string;exact:string},measure:(text:string)=>number){
 const compact=(value:number)=>Number(value.toFixed(1)).toString();
 const same=Math.abs(yours-options)<.000001;
 if(same){const text=`${labels.exact} ${compact(yours)}`,w=measure(text),x=position(yours);return [{value:yours,x,text,labelX:Math.max(w/2,Math.min(width-w/2,x)),anchor:'middle' as const,rail:0,labelRail:1,color:'#dc2626',exact:true}];}
 const points=[{value:yours,color:'#ef4444',label:labels.yours},{value:options,color:'#94a3b8',label:labels.options}].sort((a,b)=>a.value-b.value);
 const result=points.map((point,index)=>{const text=index===0?`${point.label} ${compact(point.value)}`:`${compact(point.value)} ${point.label}`;const textWidth=measure(text);const x=position(point.value);const fits=index===0?x-7>=textWidth:width-x-7>=textWidth;
  // Preserve the marker's exact x position. Only text moves inward at an edge.
  return {...point,x,text,labelX:fits?x+(index===0?-7:7):index===0?0:width,anchor:(fits?(index===0?'end':'start'):(index===0?'start':'end')) as 'start'|'end',rail:fits?0:index+1,labelRail:undefined,exact:false};});
 const bounds=result.map(point=>{const w=measure(point.text);return point.anchor==='end'?[point.labelX-w,point.labelX]:[point.labelX,point.labelX+w];});
 if(result[0].rail===result[1].rail&&bounds[0][1]+6>bounds[1][0])result[1].rail=result[0].rail+1;
 return result;
}
