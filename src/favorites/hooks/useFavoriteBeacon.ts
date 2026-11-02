import {minuteActivityPayload} from '@/lib/minuteActivity';
import {attentionPayload,seenPayload,subscribeAttention} from '@/lib/activeAttention';
import { useEffect, useState } from 'react';
import { DEMO_MODE, PREVIEW_DEPLOY } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { AUTOMATED } from '@/lib/automation';
import { getLocale } from '@/i18n/core';
import { getPinnedLocale } from '@/lib/pinnedLocale';
import { currentPage } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import { createBeaconDebouncer, PROGRESS_DEBOUNCE_MS, PROGRESS_MAX_WAIT_MS } from '@/lib/beaconScheduler';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import type { FavoriteExportKind } from '../../../api/_favoriteRecord';
import { createFavoriteBeaconDelivery } from './favoriteBeaconDelivery';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { buildFavoritesSnapshot, type FavoritesSnapshot } from '../export/snapshot';
const delivery = createFavoriteBeaconDelivery(() => !DEMO_MODE && !PREVIEW_DEPLOY && !isOptedOut());
type FavoriteReport = {kind:'export-shown'|'nudge-shown'} | {kind:'export';exportKind:FavoriteExportKind;stats:boolean};
type ShinyPicks = Readonly<Record<string, number>>;
function post(snapshot: FavoritesSnapshot, shinyPicks: ShinyPicks, report?: FavoriteReport, capturedAt = Date.now()) {
  if (DEMO_MODE || PREVIEW_DEPLOY || isOptedOut()) return;
  const fills = Object.fromEntries(snapshot.cells.filter(cell => cell.mon).map(cell => [cell.key,cell.mon!.id]));
  if (!Object.keys(fills).length) return;
  const shiny = Object.fromEntries(Object.entries(shinyPicks).filter(([key,id]) => fills[key]===id));
  const attention=attentionPayload('favorites');
  const seen=seenPayload('favorites');
  const activity=minuteActivityPayload('favorites');
  const content = JSON.stringify({fills,shiny,attention,seen,activity});
  const exported = report?.kind==='export' ? report : undefined;
  delivery.send({cid:getClientId(),tool:'favorites',page:currentPage(),
    kind:report?.kind ?? (snapshot.completion.filled===snapshot.completion.total?'completion':'progress'),
    exportKind:exported?.exportKind,stats:exported?.stats||undefined,
    snapshot:{v:2,fills,...(Object.keys(shiny).length?{shiny}:{})},attention,seen,activity,ts:capturedAt,locale:getLocale(),switched:getPinnedLocale(),ref:externalReferrerHost()||undefined,auto:AUTOMATED||undefined},content,!!report);
}
export function useFavoriteBeacon() {
  const fills=useFavoritesStore(state=>state.fills);
  const shiny=useFavoritesStore(state=>state.shiny);
  const [debouncer]=useState(()=>createBeaconDebouncer({delayMs:PROGRESS_DEBOUNCE_MS,maxWaitMs:PROGRESS_MAX_WAIT_MS}));
  useEffect(()=>{
    if(!buildFavoritesSnapshot(useFavoritesStore.getState().fills).completion.filled)sendEventBeacon('favorites-visit',{once:true});
  },[]);
  useEffect(()=>{
    const snapshot=buildFavoritesSnapshot(fills);
    const capturedAt=Date.now();
    debouncer.schedule(()=>post(snapshot,shiny,undefined,capturedAt));
  },[fills,shiny,debouncer]);
  useEffect(()=>subscribeAttention('favorites',()=>{
    const state=useFavoritesStore.getState();
    const snapshot=buildFavoritesSnapshot(state.fills);
    debouncer.schedule(()=>post(snapshot,state.shiny));
  }),[debouncer]);
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState==='hidden'){debouncer.flush();delivery.flush();}};
    const flush=()=>{debouncer.flush();delivery.flush();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',flush);window.addEventListener('blur',flush);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',flush);window.removeEventListener('blur',flush);flush();};
  },[debouncer]);
}
export function sendFavoriteNudgeShownBeacon() { const {fills,shiny}=useFavoritesStore.getState(); post(buildFavoritesSnapshot(fills),shiny,{kind:'nudge-shown'}); }
export function sendFavoriteExportShownBeacon(fills:Readonly<Record<string,number>>, shiny:ShinyPicks) { post(buildFavoritesSnapshot(fills),shiny,{kind:'export-shown'}); }
export function sendFavoriteExportBeacon(snapshot:FavoritesSnapshot, shiny:ShinyPicks, mode:FavoriteExportKind, stats:boolean) { post(snapshot,shiny,{kind:'export',exportKind:mode,stats}); }
