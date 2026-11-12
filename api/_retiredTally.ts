import { redis } from './_shared.js';

export const RETENTION_LAST_RUN_KEY = 'retention:last-run';
export const RETIRED_SLICES = ['dex', 'league', 'favorites', 'all'] as const;
export type RetiredSlice = (typeof RETIRED_SLICES)[number];
export const retiredKey = (slice: RetiredSlice) => `retired:${slice}`;

export const READ_RETENTION = `
local out = {}
for i = 1, #KEYS - 1 do out[i] = redis.call('HGETALL', KEYS[i]) end
out[#KEYS] = redis.call('GET', KEYS[#KEYS]) or ''
return out
`;

export interface RetiredTally {
  total: number;
  countries: Record<string, number>;
  devices: Record<string, number>;
}

export function parseRetiredTally(hash: Record<string, unknown> | null | undefined): RetiredTally {
  const out: RetiredTally = { total: 0, countries: {}, devices: {} };
  for (const [field, raw] of Object.entries(hash ?? {})) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) continue;
    const [kind, value] = field.split(/:(.*)/s);
    if (field === 'total') out.total = n;
    else if (value && value !== 'unknown' && kind === 'country') out.countries[value] = n;
    else if (value && value !== 'unknown' && kind === 'device') out.devices[value] = n;
  }
  return out;
}

export function withRetired<T extends { users: number; countries: Record<string, number>; devices: Record<string, number> }>(
  slice: T,
  hash: Record<string, unknown> | null | undefined,
): T {
  const tally = parseRetiredTally(hash);
  if (!tally.total) return slice;
  const add = (base: Record<string, number>, extra: Record<string, number>) => {
    const out = { ...base };
    for (const [key, n] of Object.entries(extra)) out[key] = (out[key] ?? 0) + n;
    return out;
  };
  return { ...slice, users: slice.users + tally.total, countries: add(slice.countries, tally.countries), devices: add(slice.devices, tally.devices) };
}

export type RetiredHashes = Partial<Record<RetiredSlice, Record<string, unknown> | null>>;

export interface CleanupStatus {
  lastRunAt: string | null;
  browsers: Record<RetiredSlice, number>;
}

function pairs(flat: unknown): Record<string, unknown> {
  const list = Array.isArray(flat) ? flat : [];
  const out: Record<string, unknown> = {};
  for (let i = 0; i + 1 < list.length; i += 2) out[String(list[i])] = list[i + 1];
  return out;
}

export async function readRetention(): Promise<{ retired: RetiredHashes; cleanup: CleanupStatus }> {
  const reply = await redis.eval(READ_RETENTION, [...RETIRED_SLICES.map(retiredKey), RETENTION_LAST_RUN_KEY], []);
  const list = Array.isArray(reply) ? reply : [];
  const retired: RetiredHashes = Object.fromEntries(RETIRED_SLICES.map((slice, i) => [slice, pairs(list[i])]));
  let lastRun: unknown = list[RETIRED_SLICES.length];
  if (typeof lastRun === 'string') {
    try {
      lastRun = JSON.parse(lastRun);
    } catch {
      lastRun = null;
    }
  }
  const at = lastRun && typeof lastRun === 'object' && 'at' in lastRun ? lastRun.at : undefined;
  const total = (slice: RetiredSlice) => parseRetiredTally(retired[slice]).total;
  return {
    retired,
    cleanup: {
      lastRunAt: typeof at === 'string' && Number.isFinite(Date.parse(at)) ? at : null,
      browsers: { dex: total('dex'), league: total('league'), favorites: total('favorites'), all: total('all') },
    },
  };
}
