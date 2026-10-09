import { useEffect, useState } from 'react';
import { DEMO_MODE, PREVIEW_DEPLOY } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
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
/** A one-off report. Delivery never folds it into an unchanged progress board. */
type FavoriteReport = {kind:'export-shown'|'nudge-shown'} | {kind:'export';exportKind:FavoriteExportKind;stats:boolean};
function post(snapshot: FavoritesSnapshot, report?: FavoriteReport, capturedAt = Date.now()) {
  if (DEMO_MODE || PREVIEW_DEPLOY || isOptedOut()) return;
  const fills = Object.fromEntries(snapshot.cells.filter(cell => cell.mon).map(cell => [cell.key,cell.mon!.id]));
  const content = JSON.stringify(fills);
  const exported = report?.kind==='export' ? report : undefined;
  delivery.send({cid:getClientId(),tool:'favorites',page:currentPage(),
    kind:report?.kind ?? (snapshot.completion.filled===snapshot.completion.total?'completion':'progress'),
    exportKind:exported?.exportKind,stats:exported?.stats||undefined,
    snapshot:{v:1,fills},ts:capturedAt,locale:getLocale(),switched:getPinnedLocale(),ref:externalReferrerHost()||undefined},content,!!report);
}
/** Report one validated board after a pause, with a bounded wait during continuous edits. */
export function useFavoriteBeacon() {
  const fills=useFavoritesStore(state=>state.fills);
  const [debouncer]=useState(()=>createBeaconDebouncer({delayMs:PROGRESS_DEBOUNCE_MS,maxWaitMs:PROGRESS_MAX_WAIT_MS}));
  useEffect(()=>{
    const snapshot=buildFavoritesSnapshot(fills);
    const capturedAt=Date.now();
    debouncer.schedule(()=>post(snapshot,undefined,capturedAt));
  },[fills,debouncer]);
  useEffect(()=>{
    const hidden=()=>{if(document.visibilityState==='hidden'){debouncer.flush();delivery.flush();}};
    const flush=()=>{debouncer.flush();delivery.flush();};
    document.addEventListener('visibilitychange',hidden);window.addEventListener('pagehide',flush);
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',flush);flush();};
  },[debouncer]);
}
/** Called when the completion popup appears, with the completed board. */
export function sendFavoriteNudgeShownBeacon() { post(buildFavoritesSnapshot(useFavoritesStore.getState().fills),{kind:'nudge-shown'}); }
/** Called when the export dialog opens, with the board it shows. */
export function sendFavoriteExportShownBeacon(fills:Readonly<Record<string,number>>) { post(buildFavoritesSnapshot(fills),{kind:'export-shown'}); }
/** Called only after share/download succeeds, using the board displayed in that export. */
export function sendFavoriteExportBeacon(snapshot:FavoritesSnapshot, mode:FavoriteExportKind, stats:boolean) { post(snapshot,{kind:'export',exportKind:mode,stats}); }
