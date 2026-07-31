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

function dayKeys(days: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) {
    out.push(`${COUNT_PREFIX}:${new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)}`);
  }
  return out;
}

/** Per-category totals over the last `days`, summed across the daily hashes. */
async function counts(days: number): Promise<Record<string, number>> {
  const hashes = await Promise.all(
    dayKeys(days).map((k) => redis.hgetall<Record<string, string | number>>(k)),
  );
  const total: Record<string, number> = {};
  for (const h of hashes) {
    for (const [category, n] of Object.entries(h ?? {})) {
      total[category] = (total[category] ?? 0) + Number(n);
    }
  }
  return total;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!(await requireAdmin(req, res))) return;
  try {
    const offset = Math.max(0, Number(firstQueryValue(req.query.offset)) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(firstQueryValue(req.query.limit)) || 50));

    const [rows, total, last7, last30] = await Promise.all([
      redis.lrange<string | Record<string, unknown>>(FEEDBACK_KEY, offset, offset + limit - 1),
      redis.llen(FEEDBACK_KEY),
      counts(7),
      counts(30),
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

    return res.status(200).json({ items, total, offset, limit, last7, last30 });
  } catch (err) {
    console.error('Feedback list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
