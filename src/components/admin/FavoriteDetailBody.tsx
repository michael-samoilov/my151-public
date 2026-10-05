import {useMemo,useState} from 'react';
import type {FavoriteUser} from '../../../api/_favoriteAggregate';
import {FAVORITE_TOTAL_CELLS, type FavoriteSnapshot} from '../../../api/_favoriteRecord';
import {GEN_AXIS,TYPE_AXIS,cellKey} from '@/favorites/model/cells';
import {getPickerMon} from '@/favorites/model/catalog';
import {labelOf} from '@/favorites/components/spriteLabel';
import {SessionTimeline,type TimelinePoint} from './charts/SessionTimeline';
import {Panel,Kpi} from './ui';

/** Snapshot preview is read-only. A swapped cell counts as one addition and one removal. */
export function FavoriteDetailBody({user}:{user:FavoriteUser}) {
  const sessions = useMemo(()=>[...user.sessionLog].sort((a,b)=>a.ts-b.ts),[user.sessionLog]);
  const [index,setIndex] = useState(Math.max(0,sessions.length-1));
  const current = Math.min(index,Math.max(0,sessions.length-1));
  const snapshot = sessions[current]?.snapshot ?? user.latest;
  const points:TimelinePoint[] = sessions.map((s,i)=>{
    const previous = sessions[i-1]?.snapshot.fills ?? {};
    let added=0,removed=0;
    for (const [key,id] of Object.entries(s.snapshot.fills)) if(previous[key]!==id) added++;
    for (const [key,id] of Object.entries(previous)) if(s.snapshot.fills[key]!==id) removed++;
    return {t:s.ts,count:s.snapshot.filled,net:s.snapshot.filled,added,removed,dur:(s.endTs-s.ts)/1000,ev:s.events};
  });
  const board=<div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto" data-testid="admin-favorite-detail">
    <Panel title="Favorite Pokémon Picker" sub={[`${snapshot.filled} / ${FAVORITE_TOTAL_CELLS} cells`]}>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Kpi value={snapshot.picksFilled} label="Picks" />
        <Kpi value={snapshot.pointersFilled} label="Favorite pointers" />
        <Kpi value={snapshot.uniqueIds.length} label="Unique Pokémon" />
        <Kpi value={user.exportsFull} label="Full grid exports" />
        <Kpi value={user.exportsSimplified} label="Simplified exports" />
      </div>
    </Panel>
    <FavoriteSnapshotGrid snapshot={snapshot}/>
  </div>;
  if(!points.length)return board;
  return <SessionTimeline points={points} index={current} onIndex={setIndex} countUnit={`of ${FAVORITE_TOTAL_CELLS} cells`} peakLabel={`${user.maxFilled} peak cells`} tz={user.tz}>{board}</SessionTimeline>;
}
function FavoriteSnapshotGrid({snapshot}:{snapshot:FavoriteSnapshot}) {
  return <div className="min-h-0 flex-1 overflow-auto rounded-lg border bg-card" data-testid="admin-favorite-snapshot">
    <table className="w-full min-w-[880px] table-fixed border-collapse text-center text-[0.55rem]">
      <thead><tr><th className="sticky left-0 z-10 bg-card">Gen</th>{TYPE_AXIS.map(type=><th key={type} className="border p-1 capitalize">{type}</th>)}</tr></thead>
      <tbody>{GEN_AXIS.map(gen=><tr key={gen}><th className="sticky left-0 z-10 border bg-card p-1 capitalize">{typeof gen==='number'?`Gen ${gen}`:gen}</th>{TYPE_AXIS.map(type=>{
        const key=cellKey(type,gen);const mon=getPickerMon(snapshot.fills[key]);
        return <td key={key} className="h-11 border p-0.5" title={`${type} · ${gen}${mon?`: ${labelOf(mon)}`:''}`} data-favorite-coordinate={key}>{mon?<img src={mon.sprite} alt={labelOf(mon)} className="mx-auto h-10 w-10 object-contain"/>:null}</td>;
      })}</tr>)}</tbody>
    </table>
  </div>;
}
