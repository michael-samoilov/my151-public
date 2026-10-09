import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, firstQueryValue } from './_shared.js';

/**
 * Admin read for the feedback list. The only reader of `feedback` — there is no
 * public path to it, by design.
 *
 * The list is stored newest-first (LPUSH), so LRANGE pages it in the order the
 * dashboard wants without sorting. Read/unread is deliberately not tracked
 * server-side: there is exactly one admin, and their own localStorage is a
 * simpler place for it than a Redis field that can drift.
 */

const FEEDBACK_KEY = 'feedback';
const COUNT_PREFIX = 'feedback:count';
const MAX_PAGE = 200;

/** The UTC dates of the last `days` days, newest first: api/feedback.ts counts each report under its date. */
function dayStamps(days: number, now: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

type Counts = { last7: Record<string, number>; last30: Record<string, number> };
type Item = Record<string, unknown>;

/**
 * Per-category totals for the last 7 and 30 UTC days, counted from the rows
 * themselves. That works when the first page reaches past the 30-day window,
 * or holds the whole list; otherwise this returns null and the daily hashes
 * answer. Nothing deletes reports below the 5,000 cap, so the two agree.
 */
export function countsFromRows(items: Item[], total: number, offset: number, now: number): Counts | null {
  const stamps = dayStamps(30, now);
  const stampOf = (it: Item) => (typeof it.ts === 'number' && it.ts > 0 ? new Date(it.ts).toISOString().slice(0, 10) : '');
  const reachesPast = items.some((it) => {
    const day = stampOf(it);
    return day !== '' && day < stamps[29];
  });
  if (offset !== 0 || (items.length < total && !reachesPast)) return null;
  const last7: Record<string, number> = {};
  const last30: Record<string, number> = {};
  for (const it of items) {
    const at = stamps.indexOf(stampOf(it));
    if (at < 0) continue;
    const category = String(it.category);
    last30[category] = (last30[category] ?? 0) + 1;
    if (at < 7) last7[category] = (last7[category] ?? 0) + 1;
  }
  return { last7, last30 };
}

/** The same totals summed from the 30 daily hashes, one HGETALL each. */
async function countsFromHashes(now: number): Promise<Counts> {
  const hashes = await Promise.all(
    dayStamps(30, now).map((d) => redis.hgetall<Record<string, string | number>>(`${COUNT_PREFIX}:${d}`)),
  );
  const last7: Record<string, number> = {};
  const last30: Record<string, number> = {};
  hashes.forEach((h, i) => {
    for (const [category, n] of Object.entries(h ?? {})) {
      last30[category] = (last30[category] ?? 0) + Number(n);
      if (i < 7) last7[category] = (last7[category] ?? 0) + Number(n);
    }
  });
  return { last7, last30 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const offset = Math.max(0, Number(firstQueryValue(req.query.offset)) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(firstQueryValue(req.query.limit)) || 50));

    const [rows, total] = await Promise.all([
      redis.lrange<string | Record<string, unknown>>(FEEDBACK_KEY, offset, offset + limit - 1),
      redis.llen(FEEDBACK_KEY),
    ]);

    // The SDK parses JSON strings back into objects when it can, so entries
    // arrive as either — same situation parseRecord handles for clients.
    const items = rows.map((row) => {
      if (typeof row !== 'string') return row;
      try {
        return JSON.parse(row) as Record<string, unknown>;
      } catch {
        return { id: 'unparseable', ts: 0, category: 'other', message: row.slice(0, 200) };
      }
    });

    const now = Date.now();
    const { last7, last30 } = countsFromRows(items, total, offset, now) ?? (await countsFromHashes(now));
    return res.status(200).json({ items, total, offset, limit, last7, last30 });
  } catch (err) {
    console.error('Feedback list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
