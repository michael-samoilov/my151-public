import { useEffect, useRef, useState } from 'react';
import { SuperimposedHistogram } from '@/components/analytics/SuperimposedHistogram';
import { t } from '@/i18n';
import type { PickerConditionalStats } from '../stats/pickerConditionalStats';
/** Conditional reference and observed distribution share bins, ticks, mean rails and native paint. */
export function PickerBstHistogram({bst,onBinClick,activeBin}:{bst:PickerConditionalStats['bst'];onBinClick?:(start:number,end:number)=>void;activeBin?:number|null}){
 const ref=useRef<HTMLDivElement>(null),[width,setWidth]=useState(0);
 useEffect(()=>{if(!ref.current)return;const observer=new ResizeObserver(entries=>setWidth(entries[0]?.contentRect.width??0));observer.observe(ref.current);return()=>observer.disconnect();},[]);
 const scale=Math.max(1,Math.min(width/360,2)),plotW=Math.max(1,width-40*scale-12),span=bst.xDomain[1]-bst.xDomain[0];
 const step=Math.max(1,Math.ceil(32*scale/plotW*span/100));
 const ticks=bst.xTicks.filter((_,i)=>i%step===0);
 return <div ref={ref}><SuperimposedHistogram data={bst.merged} binSize={bst.binSize} xDomain={bst.xDomain} xTicks={ticks} yDomain={bst.yDomain} yTicks={bst.yTicks} textClass="text-[0.625rem]" heightScale={.87} activeBin={activeBin} onBarClick={onBinClick?center=>onBinClick(center-bst.binSize/2,center+bst.binSize/2):undefined} meanRail={bst.merged.length?{yours:bst.yoursAvg,options:bst.nationalAvg,labels:{yours:t('favorites.stats.meanYours'),options:t('favorites.stats.meanOptions'),exact:t('favorites.stats.meanExact')},legend:{yours:t('favorites.stats.yours'),options:t('favorites.stats.options')}}:undefined}/></div>;
}
