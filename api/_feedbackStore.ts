import type { VercelRequest } from '@vercel/node';
import { createHash, randomUUID } from 'node:crypto';
import { redis, getClientIp } from './_shared.js';

/**
 * Where reports land: the feedback form's and the error screen's alike, so the
 * admin's Feedback tab reads one list.
 *
 * Storage mirrors the counters-vs-records split the rest of the API uses:
 * `feedback` is a capped LIST (newest first, so LRANGE pages it in the order
 * the admin wants) and `feedback:count:<day>` is a hash of per-category totals.
 * LTRIM bounds growth with no cron job to forget about.
 *
 * The leading underscore keeps Vercel from serving this file as a route.
 */

export const FEEDBACK_KEY = 'feedback';
const COUNT_PREFIX = 'feedback:count';
/** Reports kept. At the volume a hobby site sees this is years of history. */
const MAX_STORED = 5000;
const DAILY_TTL_S = 400 * 24 * 60 * 60;

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10); // UTC YYYY-MM-DD
}

/** Counts this hour's requests under `key` and says whether `cap` still allows one. */
export async function underHourlyCap(key: string, cap: number): Promise<boolean> {
  const hourKey = `${key}:global:${new Date().toISOString().slice(0, 13)}`;
  const count = await redis.incr(hourKey);
  if (count === 1) await redis.expire(hourKey, 2 * 60 * 60);
  return count <= cap;
}

export async function storeReport(
  req: VercelRequest,
  report: { category: string; message: string; cid?: string; context: Record<string, unknown> },
): Promise<void> {
  // The IP is hashed, never stored: enough to see that twenty reports came
  // from one place, not enough to say where that place is. The salt is the
  // admin token, which already has to exist and never leaves the server.
  const ipHash = createHash('sha256')
    .update(`${getClientIp(req)}|${process.env.ADMIN_TOKEN ?? ''}`)
    .digest('hex')
    .slice(0, 16);

  const country = Array.isArray(req.headers['x-vercel-ip-country'])
    ? req.headers['x-vercel-ip-country'][0]
    : req.headers['x-vercel-ip-country'];

  const now = Date.now();
  const record = {
    id: randomUUID(),
    ts: now,
    category: report.category,
    message: report.message,
    ...(report.cid ? { cid: report.cid } : {}),
    ipHash,
    ...(country ? { country: String(country).slice(0, 4) } : {}),
    context: report.context,
  };

  const dailyKey = `${COUNT_PREFIX}:${dayKey(now)}`;
  await redis.lpush(FEEDBACK_KEY, JSON.stringify(record));
  await redis.ltrim(FEEDBACK_KEY, 0, MAX_STORED - 1);
  await redis.hincrby(dailyKey, report.category, 1);
  await redis.expire(dailyKey, DAILY_TTL_S);
}
