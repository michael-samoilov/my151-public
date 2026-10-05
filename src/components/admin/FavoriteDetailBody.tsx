import {Fragment,useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {FavoriteUser} from '../../../api/_favoriteAggregate';
import {FAVORITE_TOTAL_CELLS,type FavoriteSnapshot} from '../../../api/_favoriteRecord';
import {PokeballBg} from '@/components/shared/PokeballBg';
import {TypeBadge} from '@/components/shared/TypeBadge';
import {GEN_AXIS,TYPE_AXIS,cellKey,isGenNumber,isTypeName,type GenAxisId,type TypeAxisId} from '@/favorites/model/cells';
import {getPickerMon} from '@/favorites/model/catalog';
import {kindFor} from '@/favorites/model/eligibility';
import {labelOf} from '@/favorites/components/spriteLabel';
import {coordinateLabel} from '@/favorites/components/coordinatePresentation';
import {EmptyBall,ExtraMark,RomanDisc,TypeIcon} from '@/favorites/components/marks';
import {AxisBadge} from '@/favorites/components/WordBadge';
import {FAVORITE_ORNAMENTS} from '@/favorites/export/laurelPaint';
import {SessionTimeline,type TimelinePoint} from './charts/SessionTimeline';

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
  const board=<FavoriteSnapshotGrid snapshot={snapshot}/>;
  if(!points.length)return board;
  return <SessionTimeline points={points} index={current} onIndex={setIndex} countUnit={`of ${FAVORITE_TOTAL_CELLS} cells`} peakLabel={`${user.maxFilled} peak cells`} tz={user.tz} showReadout={false}>{board}</SessionTimeline>;
}

/** All portrait tracks share one size, fitted to the measured remaining space. */
function FavoriteSnapshotGrid({snapshot}:{snapshot:FavoriteSnapshot}) {
  const frame=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const columns=GEN_AXIS.length+1;
  const rows=TYPE_AXIS.length+1;
  useLayoutEffect(()=>{
    const el=frame.current;
    if(!el)return;
    const fit=()=>{
      const cell=Math.max(0,Math.min(el.clientWidth/columns,el.clientHeight/rows));
      setSize({width:cell*columns,height:cell*rows});
    };
    fit();
    const observer=new ResizeObserver(fit);
    observer.observe(el);
    return ()=>observer.disconnect();
  },[columns,rows]);
  return <div ref={frame} className="flex min-h-0 flex-1 items-start justify-center" data-testid="admin-favorite-detail">
    <div className="grid shrink-0 rounded-sm border border-neutral-200 bg-card" style={{...size,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${rows},minmax(0,1fr))`}} role="table" aria-label="Favorite Pokémon portrait full grid" data-testid="admin-favorite-snapshot">
      <div role="columnheader"/>
      {GEN_AXIS.map(gen=><AxisHeader key={gen} id={gen} top/>)}
      {TYPE_AXIS.map(type=><Fragment key={type}>
        <AxisHeader id={type}/>
        {GEN_AXIS.map(gen=>{
          const key=cellKey(type,gen);
          const mon=getPickerMon(snapshot.fills[key]);
          const kind=kindFor(type,gen);
          const favorite=type==='favorite'&&gen==='favorite';
          const title=`${coordinateLabel(type,gen)}${mon?`: ${labelOf(mon)}`:''}`;
          return <div key={key} role="cell" title={title} aria-label={title} data-favorite-coordinate={key} className="relative flex min-h-0 min-w-0 items-center justify-center border-[0.5px] border-neutral-200" style={{background:kind==='disabled'||kind==='null'?'#fafafa':undefined}}>
            {mon?<div className="relative h-4/5 w-4/5" style={{transform:favorite?'translateY(6%)':undefined}}>
              <PokeballBg pokemon={mon}/>
              <img src={mon.sprite} alt={labelOf(mon)} className="relative h-full w-full object-contain"/>
            </div>:kind==='pick'||kind==='pointer'?<EmptyBall kind={kind==='pick'?'poke':favorite?'master':'ultra'} className="h-3/5 w-3/5 text-neutral-400"/>:<svg viewBox="0 0 40 40" className="h-3/5 w-3/5 text-neutral-400" aria-hidden><path d="M15 20h10" stroke="currentColor" strokeWidth="1.5"/></svg>}
            {favorite&&<img src={FAVORITE_ORNAMENTS.crown} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-0 w-3/5 -translate-x-1/2 -translate-y-1/2"/>}
          </div>;
        })}
      </Fragment>)}
    </div>
  </div>;
}

function AxisHeader({id,top=false}:{id:TypeAxisId|GenAxisId;top?:boolean}) {
  const gen=isGenNumber(id);
  const badge=isTypeName(id)?<TypeBadge type={id}/>:gen?null:<AxisBadge id={id}/>;
  return <div role={top?'columnheader':'rowheader'} aria-label={gen?`Generation ${id}`:id} className="relative flex min-h-0 min-w-0 flex-col items-center justify-center border-[0.5px] border-neutral-200" style={{gap:'1%'}}>
    <div className="flex items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain" style={{width:gen?'74%':'65%',height:gen?'74%':'65%'}}>
      {isTypeName(id)?<TypeIcon type={id}/>:gen?<RomanDisc gen={id}/>:<ExtraMark id={id}/>}
    </div>
    {badge&&<div className="w-[90%] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">{badge}</div>}
  </div>;
}
