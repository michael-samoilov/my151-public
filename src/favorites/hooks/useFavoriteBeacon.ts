import {minuteActivityPayload} from '@/lib/minuteActivity';
import {attentionPayload,subscribeAttention} from '@/lib/activeAttention';
import { useEffect, useState } from 'react';
import { DEMO_MODE, PREVIEW_DEPLOY } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { AUTOMATED } from '@/lib/automation';
import { getLocale } from '@/i18n/core';
import { getPinnedLocale } from '@/lib/pinnedLocale';
import { currentPage } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import { createBeaconDebouncer, PROGRESS_DEBOUNCE_MS, PROGRESS_MAX_WAIT_MS } from '@/lib/beaconScheduler';
import type { FavoriteExportKind } from '../../../api/_favoriteRecord';
import { createFavoriteBeaconDelivery } from './favoriteBeaconDelivery';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { buildFavoritesSnapshot, type FavoritesSnapshot } from '../export/snapshot';
const delivery = createFavoriteBeaconDelivery(() => !DEMO_MODE && !PREVIEW_DEPLOY && !isOptedOut());
type FavoriteReport = {kind:'export-shown'|'nudge-shown'} | {kind:'export';exportKind:FavoriteExportKind;stats:boolean};
function post(snapshot: FavoritesSnapshot, report?: FavoriteReport, capturedAt = Date.now()) {
  if (DEMO_MODE || PREVIEW_DEPLOY || isOptedOut()) return;
  const fills = Object.fromEntries(snapshot.cells.filter(cell => cell.mon).map(cell => [cell.key,cell.mon!.id]));
  const attention=attentionPayload('favorites');
  const activity=minuteActivityPayload('favorites');
  const content = JSON.stringify({fills,attention,activity});
  const exported = report?.kind==='export' ? report : undefined;
  delivery.send({cid:getClientId(),tool:'favorites',page:currentPage(),
    kind:report?.kind ?? (snapshot.completion.filled===snapshot.completion.total?'completion':'progress'),
    exportKind:exported?.exportKind,stats:exported?.stats||undefined,
    snapshot:{v:1,fills},attention,activity,ts:capturedAt,locale:getLocale(),switched:getPinnedLocale(),ref:externalReferrerHost()||undefined,auto:AUTOMATED||undefined},content,!!report);
}
export function useFavoriteBeacon() {
  const fills=useFavoritesStore(state=>state.fills);
  const [debouncer]=useState(()=>createBeaconDebouncer({delayMs:PROGRESS_DEBOUNCE_MS,maxWaitMs:PROGRESS_MAX_WAIT_MS}));
  useEffect(()=>{
    const snapshot=buildFavoritesSnapshot(fills);
    const capturedAt=Date.now();
    debouncer.schedule(()=>post(snapshot,undefined,capturedAt));
  },[fills,debouncer]);
  useEffect(()=>subscribeAttention('favorites',()=>{
    const snapshot=buildFavoritesSnapshot(useFavoritesStore.getState().fills);
    debouncer.schedule(()=>post(snapshot));
  }),[debouncer]);
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState==='hidden'){debouncer.flush();delivery.flush();}};
    const flush=()=>{debouncer.flush();delivery.flush();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',flush);window.addEventListener('blur',flush);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',flush);window.removeEventListener('blur',flush);flush();};
  },[debouncer]);
}
export function sendFavoriteNudgeShownBeacon() { post(buildFavoritesSnapshot(useFavoritesStore.getState().fills),{kind:'nudge-shown'}); }
export function sendFavoriteExportShownBeacon(fills:Readonly<Record<string,number>>) { post(buildFavoritesSnapshot(fills),{kind:'export-shown'}); }
export function sendFavoriteExportBeacon(snapshot:FavoritesSnapshot, mode:FavoriteExportKind, stats:boolean) { post(snapshot,{kind:'export',exportKind:mode,stats}); }
