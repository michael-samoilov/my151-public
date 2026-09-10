import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  redis,
  requireAdmin,
  firstQueryValue,
  parseRecord,
  CLIENTS_KEY,
  type ClientRecord,
} from './_shared.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import {
  HAS_DEX,
  HAS_LEAGUE,
  JOURNAL_MAX_PER_DAY,
  JOURNAL_PREFIX,
  isFunnelEvent,
  parseTool,
  type JournalEntry,
} from './_events.js';

/**
 * Admin read for the per-day funnel journal (`journal:<YYYY-MM-DD>`, written by
 * api/event.ts).
 *
 * The funnel counters answer only the questions they were created for. The
 * journal is the raw record, so the hub views — who saw the hub, which card
 * they clicked, and whether they ever became a user of either tool — replay
 * from launch day rather than starting the day the view was written.
 *
 * The hub is also the one surface with no per-user record at all: a visitor
 * who reads the hub and leaves exists only here.
 */

/** Days one call may read. 90 days of lists is already a lot of round trips;
 *  a wider window is a second call, not a slower one. */
export const JOURNAL_MAX_DAYS = 90;
/** Entries one call may return. A day can hold 50,000, so an unbounded 90-day
 *  read is a 4.5-million-entry response. Past this the response is truncated
 *  from the OLDEST day, and `truncated` says so. */
export const JOURNAL_MAX_ENTRIES = 60_000;
/** Default window when the caller names neither end. */
const DEFAULT_DAYS = 30;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A `YYYY-MM-DD` query value, or null when it is not one. */
function parseDay(v: string): string | null {
  if (!DAY_RE.test(v)) return null;
  const ts = Date.parse(`${v}T00:00:00Z`);
  return Number.isFinite(ts) ? v : null;
}

function shiftDay(day: string, deltaDays: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

/** Every `YYYY-MM-DD` from `from` to `to`, inclusive and ascending. Empty when
 *  the range runs backwards. */
export function dayRange(from: string, to: string, maxDays = JOURNAL_MAX_DAYS): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to && out.length < maxDays) {
    out.push(cur);
    cur = shiftDay(cur, 1);
  }
  return out;
}

/** Parse one stored entry. The SDK parses JSON strings back into objects when
 *  it can, so entries arrive as either — the same situation parseRecord
 *  handles for client records. */
export function parseEntry(raw: unknown): JournalEntry | null {
  let o: unknown = raw;
  if (typeof raw === 'string') {
    try {
      o = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!o || typeof o !== 'object') return null;
  const e = o as Record<string, unknown>;
  if (typeof e.t !== 'number' || typeof e.cid !== 'string' || !isFunnelEvent(e.ev)) return null;
  return {
    t: e.t,
    cid: e.cid,
    tool: parseTool(e.tool),
    ev: e.ev,
    ...(typeof e.page === 'string' ? { page: e.page } : {}),
  };
}

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
    const lists = await Promise.all(days.map((d) => redis.lrange<unknown>(`${JOURNAL_PREFIX}:${d}`, 0, -1)));

    // Per-day health first, from the full lists: a day at exactly the cap is a
    // day the ltrim discarded its oldest events, and the truncation below must
    // not be mistaken for it.
    const perDay = days.map((day, i) => ({
      day,
      count: lists[i]?.length ?? 0,
      capped: (lists[i]?.length ?? 0) >= JOURNAL_MAX_PER_DAY,
    }));

    // Newest days are the ones a dashboard opens on, so drop from the oldest.
    const entries: JournalEntry[] = [];
    let truncated = false;
    for (let i = lists.length - 1; i >= 0; i--) {
      const parsed = (lists[i] ?? []).map(parseEntry).filter((e): e is JournalEntry => e !== null);
      if (entries.length + parsed.length > JOURNAL_MAX_ENTRIES) {
        truncated = true;
        break;
      }
      entries.push(...parsed);
    }
    entries.sort((a, b) => a.t - b.t);

    // The outcome join, for exactly the browsers this window saw. Membership is
    // "ever", not "in this window": the question is whether a hub visitor
    // became a user at all, and the answer can arrive after the window closes.
    const seen = new Set(entries.map((e) => e.cid));
    const [dexAll, leagueAll] = await Promise.all([
      redis.hgetall(CLIENTS_KEY) as Promise<Record<string, unknown> | null>,
      redis.hkeys(LEAGUE_CLIENTS_KEY),
    ]);
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

    // Private data — never cache.
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
