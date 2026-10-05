/** Picker cohorts and progress from validated records. No storage reads. */
import {buildDepthCurve} from './_aggregate.js';
import {FAVORITE_TOTAL_CELLS, type FavoriteRecord} from './_favoriteRecord.js';
export interface FavoriteUsageFunnel {
  opened: number;
  buckets: {label:string;count:number;exports:{full:number;simplified:number;both:number};notExported:number}[];
}
export function favoriteUsageFunnel(records: FavoriteRecord[]): FavoriteUsageFunnel {
  const buckets = [
    {label:'Not started',min:0,max:0},
    {label:'1–64 cells',min:1,max:64},
    {label:'65–128 cells',min:65,max:128},
    {label:'129–192 cells',min:129,max:192},
    {label:'193–256 cells',min:193,max:256},
    {label:'Completed',min:FAVORITE_TOTAL_CELLS,max:FAVORITE_TOTAL_CELLS},
  ].map(({label,min,max}) => {
    const rows = records.filter(r=>r.maxFilled >= min && r.maxFilled <= max);
    const full = rows.filter(r=>r.exportsFull>0 && r.exportsSimplified===0).length;
    const simplified = rows.filter(r=>r.exportsSimplified>0 && r.exportsFull===0).length;
    const both = rows.filter(r=>r.exportsFull>0 && r.exportsSimplified>0).length;
    return {label,count:rows.length,exports:{full,simplified,both},notExported:rows.length-full-simplified-both};
  });
  return {opened:records.length,buckets};
}
export function favoriteSummary(records: FavoriteRecord[]) {
  return {
    users:records.length,
    started:records.filter(r=>r.maxFilled>0).length,
    completed:records.filter(r=>r.maxFilled===FAVORITE_TOTAL_CELLS).length,
    exporters:records.filter(r=>r.exportsFull+r.exportsSimplified>0).length,
    exportsFull:records.reduce((n,r)=>n+r.exportsFull,0),
    exportsSimplified:records.reduce((n,r)=>n+r.exportsSimplified,0),
    depth:buildDepthCurve(records.map(r=>r.maxFilled)),
    unique:buildDepthCurve(records.map(r=>r.latest.uniqueIds.length)),
  };
}
export type FavoriteUser = Omit<FavoriteRecord,'seenIds'> & {archived?:boolean};
export function favoriteUser(r:FavoriteRecord, archived:boolean):FavoriteUser {
  const {seenIds: _seenIds,...user} = r;
  void _seenIds;
  return {...user,archived};
}
