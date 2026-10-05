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
function post(snapshot: FavoritesSnapshot, exportKind?: FavoriteExportKind, capturedAt = Date.now()) {
  if (DEMO_MODE || PREVIEW_DEPLOY || isOptedOut()) return;
  const fills = Object.fromEntries(snapshot.cells.filter(cell => cell.mon).map(cell => [cell.key,cell.mon!.id]));
  const content = JSON.stringify(fills);
  delivery.send({cid:getClientId(),tool:'favorites',page:currentPage(),
    kind:exportKind?'export':snapshot.completion.filled===snapshot.completion.total?'completion':'progress',exportKind,
    snapshot:{v:1,fills},ts:capturedAt,locale:getLocale(),switched:getPinnedLocale(),ref:externalReferrerHost()||undefined},content,!!exportKind);
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
    return()=>{document.removeEventListener('visibilitychange',hidden);window.removeEventListener('pagehide',flush);debouncer.flush();};
  },[debouncer]);
}
/** Called only after share/download succeeds, using the board displayed in that export. */
export function sendFavoriteExportBeacon(snapshot:FavoritesSnapshot, mode:FavoriteExportKind) { post(snapshot,mode); }
