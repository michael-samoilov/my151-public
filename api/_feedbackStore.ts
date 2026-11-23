import type { VercelRequest } from './_vercel.js';
import { randomUUID } from 'node:crypto';
import { redis, CLIENTS_KEY } from './_shared.js';
import { LEAGUE_CLIENTS_KEY } from './_leagueRecord.js';
import { FAVORITE_CLIENTS_KEY } from './_favoriteRecord.js';

export const FEEDBACK_KEY = 'feedback';
export const UNVERIFIED_FEEDBACK_KEY = 'feedback:unverified';
export const CRASH_KEY = 'feedback:crash';
export const FEEDBACK_LISTS = [FEEDBACK_KEY, UNVERIFIED_FEEDBACK_KEY, CRASH_KEY] as const;
export type FeedbackList = (typeof FEEDBACK_LISTS)[number];
const MAX_STORED: Record<FeedbackList, number> = {
  [FEEDBACK_KEY]: 5000,
  [UNVERIFIED_FEEDBACK_KEY]: 1000,
  [CRASH_KEY]: 1000,
};
export const FEEDBACK_COUNT_PREFIX = 'feedback:count';

function dayKey(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

export async function underHourlyCap(key: string, cap: number): Promise<boolean> {
  const hourKey = `${key}:global:${new Date().toISOString().slice(0, 13)}`;
  const count = await redis.incr(hourKey);
  if (count === 1) await redis.expire(hourKey, 2 * 60 * 60);
  return count <= cap;
}

const ANY_HASH_HAS_FIELD = `
for _, key in ipairs(KEYS) do
  if redis.call('HEXISTS', key, ARGV[1]) == 1 then return 1 end
end
return 0
`;

export async function hasStoredRecord(cid: string | undefined): Promise<boolean> {
  if (!cid) return false;
  return (await redis.eval(ANY_HASH_HAS_FIELD, [CLIENTS_KEY, LEAGUE_CLIENTS_KEY, FAVORITE_CLIENTS_KEY], [cid])) === 1;
}

export async function storeReport(
  req: VercelRequest,
  list: FeedbackList,
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

  const dailyKey = `${FEEDBACK_COUNT_PREFIX}:${dayKey(now)}`;
  await redis
    .pipeline()
    .lpush(list, JSON.stringify(record))
    .ltrim(list, 0, MAX_STORED[list] - 1)
    .hincrby(dailyKey, report.category, 1)
    .exec();
}
