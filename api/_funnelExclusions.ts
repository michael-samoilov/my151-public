import { redis } from './_shared.js';
import { JOURNAL_PREFIX, JOURNAL_TTL_DAYS } from './_events.js';
import { DAY_MS, dayStart } from './_aggregate.js';

export const FUNNEL_EXCLUDED_KEY = 'funnel:excluded';

const COUNT_EVENTS = `
local markers = {}
local want = {}
for i = 1, #ARGV do
  want[ARGV[i]] = true
  markers[i] = '"cid":"' .. ARGV[i] .. '"'
end
local out = {}
for _, key in ipairs(KEYS) do
  local day = string.sub(key, -10)
  for _, raw in ipairs(redis.call('LRANGE', key, 0, -1)) do
    for _, marker in ipairs(markers) do
      if string.find(raw, marker, 1, true) then
        local ok, e = pcall(cjson.decode, raw)
        if ok and type(e) == 'table' and want[e.cid] and type(e.ev) == 'string' then
          local field = day .. '|' .. e.ev
          out[field] = (out[field] or 0) + 1
        end
        break
      end
    end
  end
end
local flat = {}
for field, n in pairs(out) do
  flat[#flat + 1] = field
  flat[#flat + 1] = n
end
return flat
`;

const ADJUST = `
for i = 1, #ARGV, 2 do
  if redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) <= 0 then redis.call('HDEL', KEYS[1], ARGV[i]) end
end
return 1
`;

const DAYS_PER_CALL = 31;

export async function countJournalEvents(cids: string[], now = Date.now()): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (!cids.length) return out;
  const today = dayStart(now);
  const keys = Array.from({ length: JOURNAL_TTL_DAYS + 1 }, (_, i) =>
    `${JOURNAL_PREFIX}:${new Date(today - i * DAY_MS).toISOString().slice(0, 10)}`);
  for (let i = 0; i < keys.length; i += DAYS_PER_CALL) {
    const flat = (await redis.eval(COUNT_EVENTS, keys.slice(i, i + DAYS_PER_CALL), cids)) as unknown[];
    for (let j = 0; j + 1 < (flat?.length ?? 0); j += 2) out[String(flat[j])] = (out[String(flat[j])] ?? 0) + Number(flat[j + 1]);
  }
  return out;
}

export async function adjustFunnelExclusions(cid: string, sign: 1 | -1): Promise<void> {
  const found = await countJournalEvents([cid]);
  const args = Object.entries(found).flatMap(([field, n]) => [field, String(sign * n)]);
  if (args.length) await redis.eval(ADJUST, [FUNNEL_EXCLUDED_KEY], args);
}

export async function rebuildFunnelExclusions(archived: string[]): Promise<number> {
  const found = await countJournalEvents(archived);
  const building = `${FUNNEL_EXCLUDED_KEY}:building`;
  await redis.del(building);
  if (!Object.keys(found).length) {
    await redis.del(FUNNEL_EXCLUDED_KEY);
    return 0;
  }
  await redis.hset(building, found);
  await redis.rename(building, FUNNEL_EXCLUDED_KEY);
  return Object.values(found).reduce((a, b) => a + b, 0);
}

export function excludedTotals(hash: Record<string, unknown> | null | undefined, days: Set<string> | null): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [field, raw] of Object.entries(hash ?? {})) {
    const split = field.indexOf('|');
    const n = Number(raw);
    if (split < 0 || !Number.isFinite(n) || n <= 0) continue;
    if (days && !days.has(field.slice(0, split))) continue;
    const ev = field.slice(split + 1);
    out[ev] = (out[ev] ?? 0) + n;
  }
  return out;
}
