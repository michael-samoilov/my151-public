import {useLayoutEffect,useMemo,useRef,useState} from 'react';
import type {FavoriteUser} from '../../../api/_favoriteAggregate';
import {FAVORITE_TOTAL_CELLS,type FavoriteSnapshot} from '../../../api/_favoriteRecord';
import {PokeballBg} from '@/components/shared/PokeballBg';
import {TypeBadge} from '@/components/shared/TypeBadge';
import {useIsDesktop} from '@/hooks/useIsDesktop';
import {GEN_AXIS,TYPE_AXIS,cellKey,isGenNumber,isTypeName,type GenAxisId,type TypeAxisId} from '@/favorites/model/cells';
import {getPickerMon} from '@/favorites/model/catalog';
import {kindFor} from '@/favorites/model/eligibility';
import {labelOf} from '@/favorites/components/spriteLabel';
import {coordinateLabel} from '@/favorites/components/coordinatePresentation';
import {EmptyBall,ExtraMark,RomanDisc,TypeIcon} from '@/favorites/components/marks';
import {AxisBadge} from '@/favorites/components/WordBadge';
import {FAVORITE_ORNAMENTS} from '@/favorites/export/laurelPaint';
import {SessionTimeline,type TimelinePoint} from './charts/SessionTimeline';
import {favoriteExportMarks,feedbackMarks} from './charts/sessionMilestones';
import type {FeedbackItem} from './feedbackList';
import {distinctCalendarDays} from './charts/sessionTimelineMath';
import {SessionsChip,TimeChip} from './SessionRailChips';

/** Snapshot preview is read-only. A swapped cell counts as one addition and one removal.
 *  A point sits at its visit's last report, as Dex and League sittings do. */
export function FavoriteDetailBody({user,reports=[]}:{user:FavoriteUser;reports?:FeedbackItem[]}) {
  const sessions = useMemo(()=>[...user.sessionLog].sort((a,b)=>a.endTs-b.endTs),[user.sessionLog]);
  const [index,setIndex] = useState(Math.max(0,sessions.length-1));
  // SessionTimeline holds its snapshot until release. Like the Dex and League
  // boards, follow the slider's input events so the grid tracks the drag.
  useLayoutEffect(()=>{
    const fromSlider=()=>{
      const el=document.querySelector('input[aria-label="Scrub sessions"]');
      if(!(el instanceof HTMLInputElement))return;
      const i=Number(el.value);
      if(Number.isInteger(i)&&i>=0&&i<sessions.length)setIndex(i);
    };
    document.addEventListener('input',fromSlider,true);
    return ()=>document.removeEventListener('input',fromSlider,true);
  },[sessions.length]);
  const current = Math.min(index,Math.max(0,sessions.length-1));
  const snapshot = sessions[current]?.snapshot ?? user.latest;
  const points = useMemo(()=>sessions.map((s,i):TimelinePoint=>{
    const previous = sessions[i-1]?.snapshot.fills ?? {};
    let added=0,removed=0;
    for (const [key,id] of Object.entries(s.snapshot.fills)) if(previous[key]!==id) added++;
    for (const [key,id] of Object.entries(previous)) if(s.snapshot.fills[key]!==id) removed++;
    return {t:s.endTs,count:s.snapshot.filled,net:s.snapshot.filled,added,removed,dur:(s.endTs-s.ts)/1000,ev:s.events};
  }),[sessions]);
  const board=<FavoriteSnapshotGrid snapshot={snapshot}/>;
  if(!points.length)return board;
  const totalMs=sessions.reduce((ms,s)=>ms+s.endTs-s.ts,0);
  const days=Math.max(1,distinctCalendarDays(points.map(p=>p.t),user.tz));
  const single=points.length<=1;
  const clampT=(t:number)=>Math.max(points[0].t,Math.min(points[points.length-1].t,t));
  return <SessionTimeline points={points} index={current} onIndex={setIndex} countUnit={`of ${FAVORITE_TOTAL_CELLS}`} peakLabel={`${user.maxFilled} peak cells`}
    milestones={[...favoriteExportMarks(points),...feedbackMarks(reports,clampT)]} tz={user.tz}
    leftChip={<SessionsChip sessions={user.sessions} days={days} full={single}/>}
    rightChip={<TimeChip ms={totalMs} full={single}/>}>{board}</SessionTimeline>;
}

/** All tracks share one size, fitted to the measured remaining space. */
function FavoriteSnapshotGrid({snapshot}:{snapshot:FavoriteSnapshot}) {
  const frame=useRef<HTMLDivElement>(null);
  const [size,setSize]=useState({width:0,height:0});
  const desktop=useIsDesktop();
  const columnAxes=desktop?TYPE_AXIS:GEN_AXIS;
  const tracks=desktop
    ?GEN_AXIS.map(gen=>({axis:gen,cells:TYPE_AXIS.map(type=>({type,gen}))}))
    :TYPE_AXIS.map(type=>({axis:type,cells:GEN_AXIS.map(gen=>({type,gen}))}));
  const columns=columnAxes.length+1;
  const rows=tracks.length+1;
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
    <div className="grid shrink-0 rounded-sm border border-neutral-200 bg-card" style={{...size,gridTemplateColumns:`repeat(${columns},minmax(0,1fr))`,gridTemplateRows:`repeat(${rows},minmax(0,1fr))`}} role="table" aria-label={`Favorite Pokémon ${desktop?'landscape':'portrait'} full grid`} data-testid="admin-favorite-snapshot">
      <div role="row" className="contents">
        <div role="columnheader"/>
        {columnAxes.map(axis=><AxisHeader key={axis} id={axis} top/>)}
      </div>
      {tracks.map(track=><div key={track.axis} role="row" className="contents">
        <AxisHeader id={track.axis}/>
        {track.cells.map(({type,gen})=>{
          const key=cellKey(type,gen);
          const mon=getPickerMon(snapshot.fills[key]);
          const kind=kindFor(type,gen);
          const favorite=type==='favorite'&&gen==='favorite';
          const title=`${coordinateLabel(type,gen)}${mon?`: ${labelOf(mon)}`:''}`;
          return <div key={key} role="cell" title={title} aria-label={title} data-favorite-coordinate={key} className="relative flex min-h-0 min-w-0 items-center justify-center border-[0.5px] border-neutral-200" style={{background:kind==='disabled'||kind==='null'?'#fafafa':undefined}}>
            {mon?<div className="relative h-4/5 w-4/5" style={{transform:favorite?'translateY(6%)':undefined}}>
              <PokeballBg pokemon={mon}/>
              <img src={mon.sprite} alt="" aria-hidden data-favorite-sprite className="relative h-full w-full object-contain"/>
            </div>:kind==='pick'||kind==='pointer'?<EmptyBall kind={kind==='pick'?'poke':favorite?'master':'ultra'} className="h-3/5 w-3/5 text-neutral-400"/>:<svg viewBox="0 0 40 40" className="h-3/5 w-3/5 text-neutral-400" aria-hidden><path d="M15 20h10" stroke="currentColor" strokeWidth="1.5"/></svg>}
            {favorite&&<img src={FAVORITE_ORNAMENTS.crown} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-0 w-3/5 -translate-x-1/2 -translate-y-1/2"/>}
          </div>;
        })}
      </div>)}
    </div>
  </div>;
}

function AxisHeader({id,top=false}:{id:TypeAxisId|GenAxisId;top?:boolean}) {
  const gen=isGenNumber(id);
  const badge=isTypeName(id)?<TypeBadge type={id}/>:gen?null:<AxisBadge id={id}/>;
  return <div role={top?'columnheader':'rowheader'} aria-label={gen?`Generation ${id}`:id} className="relative flex min-h-0 min-w-0 flex-col items-center justify-center border-[0.5px] border-neutral-200" style={{gap:'1%'}}>
    <div aria-hidden className="flex items-center justify-center [&_img]:h-full [&_img]:w-full [&_img]:object-contain" style={{width:gen?'74%':'65%',height:gen?'74%':'65%'}}>
      {isTypeName(id)?<TypeIcon type={id}/>:gen?<RomanDisc gen={id}/>:<ExtraMark id={id}/>}
    </div>
    {badge&&<div aria-hidden className="w-[90%] [&_svg]:block [&_svg]:h-auto [&_svg]:w-full">{badge}</div>}
  </div>;
}
