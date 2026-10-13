import { renderFullChart } from './renderFullChart';
import { renderSimplifiedChart } from './renderSimplifiedChart';
import { image } from './canvas';
import { composeStatsExport } from '@/lib/exportStatsFrame';
import { pickerConditionalStats, type PickerConditionalStats } from '../stats/pickerConditionalStats';
import { pickerIndexDomain } from '../stats/pickerIndexDomain';
import type { FavoritesSnapshot } from './snapshot';
import { drawExportButterfly, drawExportStatsTitle, type IconDrawer } from '@/lib/exportButterfly';
import { drawExportHistogram } from '@/lib/exportStats';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeGlyphPath } from '@/data/type-ids';
import { drawTypeBadge } from '@/lib/drawTypeBadge';
import { drawColorBadge, drawShapeBadge, drawEvolutionBadge, type EvolutionRole } from '@/lib/drawAttributeBadge';
import { COLOR_BADGE_FILLS } from '@/lib/attributeBadgeStyle';
import { t } from '@/i18n';
import type { ColorName, ShapeName, TypeName } from '@/types/pokemon';
type Dimension='type'|'color'|'shape'|'evolution';
function titles():Record<Dimension,string>{return {type:t('stats.type.title'),color:t('favorites.stats.color'),shape:t('favorites.stats.shape'),evolution:t('favorites.stats.evolution')};}
function headers():Record<Dimension,string>{return {type:t('chart.header.type'),color:t('chart.header.color'),shape:t('chart.header.shape'),evolution:t('chart.header.evolution')};}
const W=320,GAP=16,PANEL_W=W*2+GAP;
function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,maxWidth?:number){ctx.font='400 10px "Inter Variable", system-ui, sans-serif';ctx.fillStyle='#737373';ctx.textAlign='left';ctx.textBaseline='alphabetic';if(maxWidth===undefined)ctx.fillText(text,x,y);else ctx.fillText(text,x,y,maxWidth);}
function snapshotIncomplete(stats:PickerConditionalStats){return stats.incomplete;}
function rowIcon(dimension:Dimension,key:string,images:Map<string,HTMLImageElement>):IconDrawer{
 return (ctx,x,y,w,h)=>{
  const height=Math.min(h,w/5),sx=x+(w-height*5)/2,sy=y+(h-height)/2;
  if(dimension==='type') drawTypeBadge(ctx,key as TypeName,images.get(typeGlyphPath(key as TypeName))??null,sx,sy,height);
  else if(dimension==='shape') drawShapeBadge(ctx,key as ShapeName,images.get(`/shapes/${key}.png`)??null,sx,sy,height);
  else if(dimension==='color') drawColorBadge(ctx,key as ColorName,sx,sy,height);
  else drawEvolutionBadge(ctx,key as EvolutionRole,sx,sy,height);
 };
}
function meanLabels() { return { labels: { yours: t('favorites.stats.meanYours'), options: t('favorites.stats.meanOptions'), exact: t('favorites.stats.meanExact') } }; }
function bstCardGeometry(ctx: CanvasRenderingContext2D, stats: PickerConditionalStats) {
 const chartY = snapshotIncomplete(stats) ? 70 : 56;
 const chartHeight = stats.dimensions.bst.coveredChoices ? drawExportHistogram(ctx, 0, 0, stats.bst, .87, false, meanLabels()) : 36;
 return { chartY, height: chartY + chartHeight + 12 };
}
/** Natural panel bounds come from the same histogram measurement used by its painter. */
function pickerStatsPanelSize(ctx: CanvasRenderingContext2D, stats: PickerConditionalStats) {
 return { w: PANEL_W, h: Math.max(864, 608 + bstCardGeometry(ctx, stats).height) };
}
/** Native panel, exported for the preview audit; the live export uses exactly this painter. */
function drawPickerStatsPanel(ctx:CanvasRenderingContext2D,stats:PickerConditionalStats,images:Map<string,HTMLImageElement>){
 function card(d:Dimension,x:number,y:number,h:number){
  ctx.save();ctx.translate(x,y);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,h,8);ctx.fill();drawExportStatsTitle(ctx,titles()[d],20,12);
  const data=stats.dimensions[d];
  const rows=[...data.rows].sort((a,b)=>(b.deviation??-Infinity)-(a.deviation??-Infinity)).map(row=>({...row,unavailable:row.expected===0,color:d==='type'?TYPE_COLORS[row.key as TypeName]:d==='color'?COLOR_BADGE_FILLS[row.key as ColorName]:'#dc2626',barOpacity:d==='type'||d==='color'?1:undefined,barStroke:d==='color'&&row.key==='white'?'#a3a3a3':undefined,icon:rowIcon(d,row.key,images)}));
  const rowHeight=Math.min(28,(h-100)/rows.length);
  ctx.font='400 10px "Inter Variable", system-ui, sans-serif';
  drawExportButterfly(ctx,20,36,rows,rowHeight,1,headers()[d],true,{alignBaselines:true,fixedIndexDomain:pickerIndexDomain(rows)});
  if(data.rows.some(row=>row.expected===0))label(ctx,t('favorites.stats.unavailable'),20,h-8,280);ctx.restore();
 }
 card('type',0,0,488);card('color',0,504,360);card('shape',336,0,408);card('evolution',336,424,168);
 const bstGeometry = bstCardGeometry(ctx, stats);
 ctx.save();ctx.translate(336,608);ctx.fillStyle='#fff';ctx.beginPath();ctx.roundRect(0,0,W,bstGeometry.height,8);ctx.fill();drawExportStatsTitle(ctx,t('stats.bst.title'),20,12);
 label(ctx,t('favorites.stats.bstScope'),20,46,280);
 if(snapshotIncomplete(stats))label(ctx,t('favorites.stats.selectedOptions'),20,60,280);
 if(stats.dimensions.bst.coveredChoices)drawExportHistogram(ctx,20,bstGeometry.chartY,stats.bst,.87,true,meanLabels());
 else label(ctx,t('favorites.stats.empty'),20,92);

 ctx.restore();
}
/**
 * Either export layout with the stats panel beside it. The stats always come
 * from the full grid's type and generation cells; pointer choices are omitted.
 * The summary shows other cells, so its panel title says where the stats come
 * from. Ordinary rendering remains byte-identical.
 */
export async function renderChartWithStats(snapshot:FavoritesSnapshot,layout:'full'|'simplified'):Promise<Blob>{
 const stats=pickerConditionalStats(snapshot);
 const urls=[...stats.dimensions.type.rows.map(row=>typeGlyphPath(row.key as TypeName)),...stats.dimensions.shape.rows.map(row=>`/shapes/${row.key}.png`)];
 const images=new Map(await Promise.all(urls.map(async url=>[url,await image(url)] as const)));
 const base=await(layout==='full'?renderFullChart(snapshot):renderSimplifiedChart(snapshot));
 const measure = document.createElement('canvas').getContext('2d')!;
 const title=t(layout==='full'?'export.detailedStatsTitle':'favorites.export.summaryStatsTitle');
 return composeStatsExport(base,pickerStatsPanelSize(measure, stats),title,ctx=>drawPickerStatsPanel(ctx,stats,images),{prefix:t('tools.favorites')});
}
