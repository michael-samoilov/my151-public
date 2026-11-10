import type { VercelRequest } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { redis } from './_shared.js';

export const FEEDBACK_KEY = 'feedback';
const COUNT_PREFIX = 'feedback:count';
const MAX_STORED = 5000;
const DAILY_TTL_S = 400 * 24 * 60 * 60;

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

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
    ...(country ? { country: String(country).slice(0, 4) } : {}),
    context: report.context,
  };

  const dailyKey = `${COUNT_PREFIX}:${dayKey(now)}`;
  await redis
    .pipeline()
    .lpush(FEEDBACK_KEY, JSON.stringify(record))
    .ltrim(FEEDBACK_KEY, 0, MAX_STORED - 1)
    .hincrby(dailyKey, report.category, 1)
    .expire(dailyKey, DAILY_TTL_S)
    .exec();
}
