import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  parseRecord,
  CLIENTS_KEY,
  type ClientRecord,
} from './_shared.js';
import { FAVORITE_CLIENTS_KEY } from './_favoriteRecord.js';
import { ARCHIVED_KEY, asArchivedSet, isArchived } from './_archive.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import {
  HAS_DEX,
  HAS_LEAGUE,
  HAS_FAVORITES,
  JOURNAL_MAX_PER_DAY,
  JOURNAL_PREFIX,
  parseJournalEntry,
  type JournalEntry,
} from './_events.js';

export const JOURNAL_MAX_DAYS = 90;
export const JOURNAL_MAX_ENTRIES = 60_000;
const DEFAULT_DAYS = 30;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDay(v: string): string | null {
  if (!DAY_RE.test(v)) return null;
  const ts = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ts) ? v : null;
}

function shiftDay(day: string, deltaDays: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

export function dayRange(from: string, to: string, maxDays = JOURNAL_MAX_DAYS): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < maxDays) {
    out.push(cur);
    cur = shiftDay(cur, 1);
  }
  return out;
}

export const parseEntry = parseJournalEntry;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    if (!(await requireAdmin(req, res))) return;

    const today = new Date().toISOString().slice(0, 10);
    const to = parseDay(firstQueryValue(req.query.to as string | string[] | undefined)) ?? today;
    const from =
      parseDay(firstQueryValue(req.query.from as string | string[] | undefined)) ??
      shiftDay(to, -(DEFAULT_DAYS - 1));
    if (from > to) return res.status(400).json({ error: 'from is after to' });

    const days = dayRange(from, to);
    const [lists, archivedRaw, dexAll, leagueAll, favoriteAll] = await Promise.all([
      Promise.all(days.map((d) => redis.lrange<unknown>(`${JOURNAL_PREFIX}:${d}`, 0, -1))),
      redis.smembers(ARCHIVED_KEY),
      redis.hgetall(CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.hkeys(LEAGUE_CLIENTS_KEY),
      redis.hkeys(FAVORITE_CLIENTS_KEY),
    ]);
    const archived = asArchivedSet(archivedRaw);

    const perDay = days.map((day, i) => ({
      day,
      count: lists[i]?.length ?? 0,
      capped: (lists[i]?.length ?? 0) >= JOURNAL_MAX_PER_DAY,
    }));

    const entries: JournalEntry[] = [];
    let truncated = false;
    for (let i = lists.length - 1; i >= 0; i--) {
      const parsed = (lists[i] ?? []).map(parseEntry).filter((e): e is JournalEntry => e !== null && !isArchived(e.cid, archived));
      if (entries.length + parsed.length > JOURNAL_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push(...parsed);
    }
    entries.sort((a, b) => a.t - b.t);

    const seen = new Set(entries.map((e) => e.cid));
    const membership: Record<string, number> = {};
    for (const raw of Object.values(dexAll ?? {})) {
      const rec = parseRecord(raw) as ClientRecord | null;
      if (!rec) continue;
      const cid = rec.cid.split('::')[0];
      if (seen.has(cid)) membership[cid] = (membership[cid] ?? 0) | HAS_DEX;
    }
    for (const cid of leagueAll ?? []) {
      if (seen.has(cid)) membership[cid] = (membership[cid] ?? 0) | HAS_LEAGUE;
    }

    for (const cid of favoriteAll ?? []) {
      if (seen.has(cid)) membership[cid] = (membership[cid] ?? 0) | HAS_FAVORITES;
    }

    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
      from,
      to: days[days.length - 1] ?? to,
      maxDays: JOURNAL_MAX_DAYS,
      dayCap: JOURNAL_MAX_PER_DAY,
      days: perDay,
      entries,
      truncated,
      membership,
    });
  } catch (err) {
    console.error('Journal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
