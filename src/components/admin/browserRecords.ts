import { useEffect, useState } from 'react';
import type { FavoriteUser } from '../../../api/_favoriteAggregate';
import type { ClientRecord, LeagueUser } from './AdminPage';

/** One browser's full records from `/api/submissions?cid=`, for its detail
 *  page. A tool the browser never used is null. */
export interface BrowserRecords {
  cid: string;
  dex: ClientRecord | null;
  league: LeagueUser | null;
  favorite: FavoriteUser | null;
}

type BrowserLoad =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; records: BrowserRecords };

/** Loads one browser. `country`, from a country-split Dex record or a
 *  feedback report, also finds a Dex record keyed `<cid>::<country>`. */
export type BrowserLoader = (cid: string, country?: string) => Promise<BrowserRecords>;

/** One request per browser per dashboard load: reopening a page reuses it. */
const cache = new Map<string, Promise<BrowserRecords>>();

/** Reads `/api/submissions?cid=`. A new `version` (the dashboard's load time)
 *  asks the server again. */
export function apiBrowserLoader(token: string, version: number): BrowserLoader {
  return (cid, country) => {
    const qs = new URLSearchParams(country ? { cid, country } : { cid });
    const key = `${token}\n${version}\n${qs}`;
    let p = cache.get(key);
    if (!p) {
      p = fetch(`/api/submissions?${qs}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(async (res) => {
        if (!res.ok) throw new Error(`Request failed (${res.status}).`);
        return (await res.json()) as BrowserRecords;
      });
      p.catch(() => cache.delete(key));
      cache.set(key, p);
    }
    return p;
  };
}

/** Loads `cid`'s records when it is set; idle when it is null. A new `load`
 *  for the same browser loads it again and keeps the last records on screen
 *  until the new ones arrive. */
export function useBrowserRecords(load: BrowserLoader | null, cid: string | null, country?: string): BrowserLoad {
  const [got, setGot] = useState<{ key: string; load: BrowserLoad } | null>(null);
  const key = `${cid}\n${country ?? ''}`;
  useEffect(() => {
    if (!load || !cid) return;
    let alive = true;
    load(cid, country).then(
      (records) => alive && setGot({ key, load: { status: 'ready', records } }),
      () => alive && setGot((prev) => (prev?.key === key && prev.load.status === 'ready' ? prev : { key, load: { status: 'error' } })),
    );
    return () => {
      alive = false;
    };
  }, [load, cid, country, key]);
  if (!load || !cid) return { status: 'idle' };
  return got?.key === key ? got.load : { status: 'loading' };
}
