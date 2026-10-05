import { renderFullChart } from './renderFullChart';
import { encodeFavoritesCanvas, image } from './canvas';
import { pickerConditionalStats, type PickerConditionalStats } from '../stats/pickerConditionalStats';
import type { FavoritesSnapshot } from './snapshot';
import { drawExportButterfly, drawExportStatsTitle, type IconDrawer } from '@/lib/exportButterfly';
import { drawExportHistogram } from '@/lib/exportStats';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { COLOR_SWATCHES } from '@/data/classifications';
import type { ColorName, TypeName } from '@/types/pokemon';
type Dimension='type'|'color'|'shape'|'evolution';
const titles:Record<Dimension,string>={type:'Type Distribution',color:'Pokédex Color',shape:'Pokémon Shape',evolution:'Evolution Stage'};
const headers:Record<Dimension,string>={type:'TYPE',color:'COLOR',shape:'SHAPE',evolution:'STAGE'};
const stages:Record<string,string>={basic:'Basic',intermediate:'Middle',final:'Final',standalone:'No evo'};
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
   ctx.fillStyle=COLOR_SWATCHES[key as ColorName];ctx.strokeStyle='#a1a1aa';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(x+8,y+h/2,7,0,Math.PI*2);ctx.fill();ctx.stroke();label(ctx,key[0].toUpperCase()+key.slice(1),x+19,y+h/2+3);
  }else{
   ctx.strokeStyle='#737373';ctx.fillStyle='#dc2626';ctx.lineWidth=1;
   if(key==='standalone'){ctx.beginPath();ctx.arc(x+9,y+h/2,5,0,Math.PI*2);ctx.fill();ctx.stroke();}
   else {const n=key==='basic'?1:key==='intermediate'?2:3;for(let i=0;i<3;i++){ctx.beginPath();ctx.arc(x+5+i*5,y+h/2,2,0,Math.PI*2);if(i<n)ctx.fill();else ctx.stroke();}}
   label(ctx,stages[key],x+21,y+h/2+3);
  }
 };
}
/** Native panel, exported for the preview audit; the live export uses exactly this painter. */
export function drawPickerStatsPanel(ctx:CanvasRenderingContext2D,stats:PickerConditionalStats,images:Map<string,HTMLImageElement>){
 function card(d:Dimension,x:number,y:number,h:number){
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,h,8);ctx.fill();drawExportStatsTitle(ctx,titles[d],20,12);
  const data=stats.dimensions[d];label(ctx,`${data.coveredChoices} choices · selector-option reference`,20,46);
  if(!data.coveredChoices){label(ctx,'No comparable choices yet',20,76);ctx.restore();return;}
  const rows=[...data.rows].sort((a,b)=>(b.deviation??-Infinity)-(a.deviation??-Infinity)).map(row=>({...row,color:d==='type'?TYPE_COLORS[row.key as TypeName]:d==='color'?COLOR_SWATCHES[row.key as ColorName]:'#dc2626',icon:rowIcon(d,row.key,images)}));
  const rowHeight=Math.min(28,(h-92)/rows.length);
  drawExportButterfly(ctx,20,64,rows,rowHeight,1,headers[d],true,{iconColAspect:d==='type'||d==='shape'?2:3.2});ctx.restore();
 }
 card('type',0,0,488);card('color',0,504,360);card('shape',336,0,408);card('evolution',336,424,168);
 ctx.save();ctx.translate(336,608);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,256,8);ctx.fill();drawExportStatsTitle(ctx,'Base Stat Total',20,12);
 label(ctx,`${stats.dimensions.bst.coveredChoices} choices · ${stats.dimensions.bst.excludedChoices} without full BST coverage`,20,46);
 if(stats.dimensions.bst.coveredChoices){drawExportHistogram(ctx,20,54,stats.bst,.85,true);ctx.fillStyle='#94a3b8';ctx.fillRect(20,236,8,8);label(ctx,'Selector options',32,243);ctx.fillStyle='#ef4444';ctx.fillRect(162,236,8,8);label(ctx,'Your picks',174,243);}
 else label(ctx,'No comparable choices yet',20,76);
 ctx.restore();
}
/** Full-grid only: pointer choices are omitted from stats; ordinary rendering remains byte-identical. */
export async function renderFullChartWithStats(snapshot:FavoritesSnapshot):Promise<Blob>{
 const stats=pickerConditionalStats(snapshot);
 const urls=[...stats.dimensions.type.rows.map(row=>typeIconPath(row.key as TypeName)),...stats.dimensions.shape.rows.map(row=>`/shapes/${row.key}.png`)];
 const images=new Map(await Promise.all(urls.map(async url=>[url,await image(url)] as const)));
 const base=await renderFullChart(snapshot),url=URL.createObjectURL(base);
 try{
  const native=await image(url),pad=24,scale=(native.height-pad*2)/PANEL_H;
  const canvas=document.createElement('canvas');canvas.width=Math.ceil(native.width+PANEL_W*scale+pad*2);canvas.height=native.height;
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Canvas unavailable');ctx.fillStyle='#f4f4f5';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(native,0,0);
  ctx.save();ctx.translate(native.width+pad,pad);ctx.scale(scale,scale);drawPickerStatsPanel(ctx,stats,images);ctx.restore();return await encodeFavoritesCanvas(canvas);
 }finally{URL.revokeObjectURL(url);}
}
