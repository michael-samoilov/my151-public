import { useEffect, useState } from 'react';
import type { FavoriteUser } from '../../../api/_favoriteAggregate';
import type { ClientRecord, LeagueUser } from './AdminPage';

/** One browser's records from `/api/submissions?cid=`, for a browser that is
 *  not on a loaded page. A tool the browser never used is null. */
export interface BrowserRecords {
  cid: string;
  dex: ClientRecord | null;
  league: LeagueUser | null;
  favorite: FavoriteUser | null;
}

export type BrowserLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; records: BrowserRecords };

/** One request per browser per page load: reopening a page reuses it. */
const cache = new Map<string, Promise<BrowserRecords>>();

function loadBrowser(token: string, cid: string): Promise<BrowserRecords> {
  const key = `${token}\n${cid}`;
  let p = cache.get(key);
  if (!p) {
    p = fetch(`/api/submissions?cid=${encodeURIComponent(cid)}`, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(async (res) => {
      if (!res.ok) throw new Error(`Request failed (${res.status}).`);
      return (await res.json()) as BrowserRecords;
    });
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** Fetches `cid`'s records when it is set; idle when it is null. */
export function useBrowserRecords(token: string | null, cid: string | null): BrowserLoad {
  const [got, setGot] = useState<{ cid: string; load: BrowserLoad } | null>(null);
  useEffect(() => {
    if (!token || !cid) return;
    let alive = true;
    loadBrowser(token, cid).then(
      (records) => alive && setGot({ cid, load: { status: 'ready', records } }),
      () => alive && setGot({ cid, load: { status: 'error' } }),
    );
    return () => {
      alive = false;
    };
  }, [token, cid]);
  if (!token || !cid) return { status: 'idle' };
  return got?.cid === cid ? got.load : { status: 'loading' };
}
