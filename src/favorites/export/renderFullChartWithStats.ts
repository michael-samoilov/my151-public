import { renderFullChart } from './renderFullChart';
import { image } from './canvas';
import { composeStatsExport } from '@/lib/exportStatsFrame';
import { pickerConditionalStats, type PickerConditionalStats } from '../stats/pickerConditionalStats';
import type { FavoritesSnapshot } from './snapshot';
import { drawExportButterfly, drawExportStatsTitle, type IconDrawer } from '@/lib/exportButterfly';
import { drawExportHistogram } from '@/lib/exportStats';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { COLOR_SWATCHES } from '@/data/classifications';
import { t, colorLabel, formatNumber } from '@/i18n';
import type { ColorName, TypeName } from '@/types/pokemon';
type Dimension='type'|'color'|'shape'|'evolution';
function titles():Record<Dimension,string>{return {type:t('stats.type.title'),color:t('favorites.stats.color'),shape:t('favorites.stats.shape'),evolution:t('favorites.stats.evolution')};}
const headers:Record<Dimension,string>={type:'TYPE',color:'COLOR',shape:'SHAPE',evolution:'STAGE'};
function stages():Record<string,string>{return {basic:t('favorites.stats.basic'),intermediate:t('favorites.stats.middle'),final:t('favorites.stats.final'),standalone:t('favorites.stats.noEvo')};}
const W=320,GAP=16,PANEL_H=864,PANEL_W=W*2+GAP;
function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number){ctx.font='400 10px "Inter Variable", system-ui, sans-serif';ctx.fillStyle='#737373';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(text,x,y);}
function rowIcon(dimension:Dimension,key:string,images:Map<string,HTMLImageElement>):IconDrawer{
 return (ctx,x,y,w,h)=>{
  const size=Math.min(h,w),sx=x+(w-size)/2,sy=y+(h-size)/2;
  if(dimension==='type'||dimension==='shape'){
   const picture=images.get(dimension==='type'?typeIconPath(key as TypeName):`/shapes/${key}.png`)!;
   if(dimension==='shape'){ctx.fillStyle='#fff';ctx.strokeStyle='#d4d4d8';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(sx+size/2,sy+size/2,size/2-.5,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.drawImage(picture,sx+size*.16,sy+size*.16,size*.68,size*.68);}
   else ctx.drawImage(picture,sx,sy,size,size);
  }else if(dimension==='color'){
   ctx.fillStyle=COLOR_SWATCHES[key as ColorName];ctx.strokeStyle='#a1a1aa';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(x+8,y+h/2,7,0,Math.PI*2);ctx.fill();ctx.stroke();label(ctx,colorLabel(key as ColorName),x+19,y+h/2+3);
  }else{
   ctx.strokeStyle='#737373';ctx.fillStyle='#dc2626';ctx.lineWidth=1;
   if(key==='standalone'){ctx.beginPath();ctx.arc(x+9,y+h/2,5,0,Math.PI*2);ctx.fill();ctx.stroke();}
   else {const n=key==='basic'?1:key==='intermediate'?2:3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(x+5+i*5,y+h/2,2,0,Math.PI*2);if(i<n)ctx.fill();else ctx.stroke();}}
   label(ctx,stages()[key],x+21,y+h/2+3);
  }
 };
}
/** Native panel, exported for the preview audit; the live export uses exactly this painter. */
export function drawPickerStatsPanel(ctx:CanvasRenderingContext2D,stats:PickerConditionalStats,images:Map<string,HTMLImageElement>){
 function card(d:Dimension,x:number,y:number,h:number){
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,h,8);ctx.fill();drawExportStatsTitle(ctx,titles()[d],20,12);
  const data=stats.dimensions[d];
  if(!data.coveredChoices){label(ctx,t('favorites.stats.empty'),20,56);ctx.restore();return;}
  const rows=[...data.rows].sort((a,b)=>(b.deviation??-Infinity)-(a.deviation??-Infinity)).map(row=>({...row,color:d==='type'?TYPE_COLORS[row.key as TypeName]:d==='color'?COLOR_SWATCHES[row.key as ColorName]:'#dc2626',icon:rowIcon(d,row.key,images)}));
  const rowHeight=Math.min(28,(h-80)/rows.length);
  ctx.font='400 10px "Inter Variable", system-ui, sans-serif';
  const roleWidth=d==='evolution'?Math.max(...Object.values(stages()).map(text=>ctx.measureText(text).width))+29:0;
  drawExportButterfly(ctx,20,44,rows,rowHeight,1,headers[d],true,{iconColAspect:d==='type'||d==='shape'?2:Math.max(3.2,roleWidth/rowHeight)});ctx.restore();
 }
 card('type',0,0,488);card('color',0,504,360);card('shape',336,0,408);card('evolution',336,424,168);
 ctx.save();ctx.translate(336,608);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,256,8);ctx.fill();drawExportStatsTitle(ctx,t('stats.bst.title'),20,12);
 if(stats.dimensions.bst.coveredChoices){label(ctx,t('favorites.stats.means',{yours:formatNumber(stats.bst.yoursAvg,{maximumFractionDigits:1}),expected:formatNumber(stats.bst.nationalAvg,{maximumFractionDigits:1})}),20,46);drawExportHistogram(ctx,20,52,stats.bst,.87,true);ctx.fillStyle='#94a3b8';ctx.fillRect(20,236,8,8);label(ctx,t('favorites.stats.options'),32,243);ctx.fillStyle='#ef4444';ctx.fillRect(162,236,8,8);label(ctx,t('favorites.stats.yours'),174,243);}
 else label(ctx,t('favorites.stats.empty'),20,76);
 ctx.restore();
}
/** Full-grid only: pointer choices are omitted from stats; ordinary rendering remains byte-identical. */
export async function renderFullChartWithStats(snapshot:FavoritesSnapshot):Promise<Blob>{
 const stats=pickerConditionalStats(snapshot);
 const urls=[...stats.dimensions.type.rows.map(row=>typeIconPath(row.key as TypeName)),...stats.dimensions.shape.rows.map(row=>`/shapes/${row.key}.png`)];
 const images=new Map(await Promise.all(urls.map(async url=>[url,await image(url)] as const)));
 const base=await renderFullChart(snapshot);
 return composeStatsExport(base,{w:PANEL_W,h:PANEL_H},t('export.detailedStatsTitle'),ctx=>drawPickerStatsPanel(ctx,stats,images));
}
