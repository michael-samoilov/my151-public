import type { VercelRequest, VercelResponse } from '@vercel/node';
import { redis, requireAdmin, firstQueryValue } from './_shared.js';
import { FEEDBACK_LISTS } from './_feedbackStore.js';

const COUNT_PREFIX = 'feedback:count';
const MAX_PAGE = 200;

function dayStamps(days: number, now: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < days; i++) out.push(new Date(now - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}

type Counts = { last7: Record<string, number>; last30: Record<string, number> };
type Item = Record<string, unknown>;

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

const READ_LISTS = `
local out = {}
for _, key in ipairs(KEYS) do
  out[#out + 1] = redis.call('LLEN', key)
  out[#out + 1] = redis.call('LRANGE', key, ARGV[1], ARGV[2])
end
return out
`;

// platform: The Upstash SDK parses JSON strings back into objects when it can, so an entry arrives as either.
function parseRow(row: string | Record<string, unknown>): Item {
  if (typeof row !== 'string') return row;
  try {
    return JSON.parse(row) as Item;
  } catch {
    return { id: 'unparseable', ts: 0, category: 'other', message: row.slice(0, 200) };
  }
}

function sumCounts(all: Counts[]): Counts {
  const last7: Record<string, number> = {};
  const last30: Record<string, number> = {};
  for (const c of all) {
    for (const [k, n] of Object.entries(c.last7)) last7[k] = (last7[k] ?? 0) + n;
    for (const [k, n] of Object.entries(c.last30)) last30[k] = (last30[k] ?? 0) + n;
  }
  return { last7, last30 };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (!(await requireAdmin(req, res))) return;
  try {
    const offset = Math.max(0, Number(firstQueryValue(req.query.offset)) || 0);
    const limit = Math.min(MAX_PAGE, Math.max(1, Number(firstQueryValue(req.query.limit)) || 50));

    const flat = await redis.eval<string[], unknown[]>(READ_LISTS, [...FEEDBACK_LISTS], [String(offset), String(offset + limit - 1)]);
    const lists = FEEDBACK_LISTS.map((_, i) => {
      const rows = flat[2 * i + 1];
      return {
        items: Array.isArray(rows) ? rows.map((row: string | Item) => parseRow(row)) : [],
        total: Number(flat[2 * i]) || 0,
      };
    });

    const now = Date.now();
    const items = lists.flatMap((l) => l.items).sort((a, b) => (Number(b.ts) || 0) - (Number(a.ts) || 0));
    const total = lists.reduce((sum, l) => sum + l.total, 0);
    const perList = lists.map((l) => countsFromRows(l.items, l.total, offset, now));
    const { last7, last30 } = perList.every((c): c is Counts => c !== null) ? sumCounts(perList) : await countsFromHashes(now);
    return res.status(200).json({ items, total, offset, limit, last7, last30 });
  } catch (err) {
    console.error('Feedback list error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
