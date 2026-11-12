import { CLIENTS_KEY, VERSION_KEY, parseRecord, redis, type ClientTool } from './_shared.js';
import { readHashInPages } from './_hashScan.js';
import { LEAGUE_CLIENTS_KEY, LEAGUE_VERSION_KEY, parseLeagueRecord } from './_leagueRecord.js';
import { FAVORITE_CLIENTS_KEY, FAVORITE_VERSION_KEY, parseFavoriteRecord } from './_favoriteRecord.js';
import { dexEngagedDays, leagueEngagedDays, pickerEngagedDays } from './_visitorQuality.js';
import { ARCHIVED_KEY, asArchivedSet, bareCid } from './_archive.js';
import { EXPORT_SURVEY_SKIPS_KEY, parseExportSurveySkipList } from './_events.js';
import { SPLIT_BACKUP_KEY, backupRecords } from './_recountDexPickFreq.js';
import { FEEDBACK_COUNT_PREFIX } from './_feedbackStore.js';
import { VISITS_PREFIX } from './_visits.js';
import { DAY_MS, dayStart } from './_aggregate.js';
import { RETENTION_LAST_RUN_KEY, retiredKey } from './_retiredTally.js';

export const RETENTION_MONTHS = 13;
export const RETENTION_LOCK_KEY = 'retention:lock';
const RETENTION_LOCK_TTL_S = 3600;
const LONGEST_OLD_TOTALS_TTL_DAYS = 400;
const RECORDS_PER_EVAL = 100;
const TOOL_HASHES = [CLIENTS_KEY, LEAGUE_CLIENTS_KEY, FAVORITE_CLIENTS_KEY];

export const RETIRE_RECORDS = `
local cutoff = tonumber(ARGV[1])
local retired = 0
local i = 2
while i <= #ARGV do
  local cid, nTool, nAll = ARGV[i], tonumber(ARGV[i + 1]), tonumber(ARGV[i + 2])
  local first = i + 3
  i = first + nTool + nAll
  local ok, rec = pcall(cjson.decode, redis.call('HGET', KEYS[1], cid) or '')
  if ok and type(rec) == 'table' and type(rec.lastTs) == 'number' and rec.lastTs < cutoff
    and redis.call('HDEL', KEYS[1], cid) == 1 then
    redis.call('HDEL', KEYS[2], cid)
    for j = first, first + nTool - 1 do redis.call('HINCRBY', KEYS[3], ARGV[j], 1) end
    for j = first + nTool, i - 1 do redis.call('HINCRBY', KEYS[4], ARGV[j], 1) end
    retired = retired + 1
  end
end
return retired
`;

export const FORGET_BROWSERS = `
local n = 0
for i = 2, #ARGV do
  local held = false
  for k = 2, #KEYS do
    if redis.call('HEXISTS', KEYS[k], ARGV[i]) == 1 then held = true end
  end
  if not held then
    if ARGV[1] == 'set' then n = n + redis.call('SREM', KEYS[1], ARGV[i])
    else n = n + redis.call('HDEL', KEYS[1], ARGV[i]) end
  end
end
return n
`;

export const PERSIST_TOTALS = `
local n = 0
for _, key in ipairs(KEYS) do n = n + redis.call('PERSIST', key) end
return n
`;

export function retentionCutoff(now: number): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - RETENTION_MONTHS, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds());
}

interface Visit {
  tool: ClientTool;
  field: string;
  cid: string;
  firstTs: number;
  lastTs: number;
  country?: string;
  device?: string;
  counted: boolean;
}

type VisitFacts = Pick<Visit, 'firstTs' | 'lastTs' | 'country' | 'device'> & { engaged: boolean };

function facts<R extends Omit<VisitFacts, 'engaged'>>(r: R | null, engagedDays: (r: R) => number[]): VisitFacts | null {
  if (!r || !Number.isFinite(r.firstTs) || !Number.isFinite(r.lastTs)) return null;
  return { firstTs: r.firstTs, lastTs: r.lastTs, country: r.country, device: r.device, engaged: engagedDays(r).length > 0 };
}

const TOOL_STORES: { tool: ClientTool; records: string; versions: string; read: (raw: unknown) => VisitFacts | null }[] = [
  { tool: 'dex', records: CLIENTS_KEY, versions: VERSION_KEY, read: (raw) => facts(parseRecord(raw), dexEngagedDays) },
  { tool: 'league', records: LEAGUE_CLIENTS_KEY, versions: LEAGUE_VERSION_KEY, read: (raw) => facts(parseLeagueRecord(raw), leagueEngagedDays) },
  { tool: 'favorites', records: FAVORITE_CLIENTS_KEY, versions: FAVORITE_VERSION_KEY, read: (raw) => facts(parseFavoriteRecord(raw), pickerEngagedDays) },
];

function tallyFields(v: Pick<Visit, 'firstTs' | 'country' | 'device'>): string[] {
  return ['total', `first:${new Date(v.firstTs).toISOString().slice(0, 7)}`, `country:${v.country || 'unknown'}`, `device:${v.device || 'unknown'}`];
}

function retireArgs(visits: readonly Visit[], cutoff: number): Map<ClientTool, string[]> {
  const countedByCid = new Map<string, Visit[]>();
  for (const v of visits) if (v.counted) countedByCid.set(v.cid, [...(countedByCid.get(v.cid) ?? []), v]);
  const args = new Map<ClientTool, string[]>(TOOL_STORES.map((store) => [store.tool, []]));
  for (const v of visits) {
    if (v.lastTs >= cutoff) continue;
    const group = v.counted ? countedByCid.get(v.cid) ?? [] : [];
    const leavesAll = group.at(-1) === v && group.every((g) => g.lastTs < cutoff);
    const newest = group.reduce((a, b) => (b.lastTs > a.lastTs ? b : a), v);
    const tool = v.counted ? tallyFields(v) : [];
    const all = leavesAll ? tallyFields({ ...newest, firstTs: Math.min(...group.map((g) => g.firstTs)) }) : [];
    args.get(v.tool)?.push(v.field, String(tool.length), String(all.length), ...tool, ...all);
  }
  return args;
}

function batches(list: readonly string[], groupSize: (at: number) => number, perBatch: number): string[][] {
  const out: string[][] = [];
  let current: string[] = [], groups = 0;
  for (let i = 0; i < list.length;) {
    const size = groupSize(i);
    current.push(...list.slice(i, i + size));
    i += size;
    if (++groups === perBatch) {
      out.push(current);
      current = [];
      groups = 0;
    }
  }
  if (current.length) out.push(current);
  return out;
}

async function evalEach(script: string, keys: string[], argLists: string[][], prefix: string[]): Promise<number> {
  let total = 0;
  for (let i = 0; i < argLists.length; i++) total += Number(await redis.eval(script, keys, [...prefix, ...argLists[i]]));
  return total;
}

function newestOrNever(times: number[]): number {
  return times.reduce((a, b) => Math.max(a, b), -Infinity);
}

function backupLastVisit(raw: unknown): number {
  try {
    return newestOrNever(backupRecords(raw).map((r) => r.lastTs));
  } catch {
    return -Infinity;
  }
}

export interface RetentionRun {
  at: string;
  retired: Record<ClientTool, number>;
  persisted: number;
}

export async function runRetention(now: number): Promise<(RetentionRun & { forgotten: Record<'skips' | 'archived' | 'backups', number> }) | null> {
  if ((await redis.set(RETENTION_LOCK_KEY, String(now), { nx: true, ex: RETENTION_LOCK_TTL_S })) !== 'OK') return null;
  try {
    const cutoff = retentionCutoff(now);
    const totalKeys = Array.from({ length: LONGEST_OLD_TOTALS_TTL_DAYS + 1 }, (_, i) => new Date(dayStart(now) - i * DAY_MS).toISOString().slice(0, 10))
      .flatMap((day) => [`funnel:${day}`, `${VISITS_PREFIX}:${day}`, `${FEEDBACK_COUNT_PREFIX}:${day}`]);
    const persisted = Number(await redis.eval(PERSIST_TOTALS, totalKeys, []));

    const [archivedMembers, dexHash, leagueHash, favoriteHash, skips, backups] = await Promise.all([
      redis.smembers(ARCHIVED_KEY),
      readHashInPages(CLIENTS_KEY),
      readHashInPages(LEAGUE_CLIENTS_KEY),
      readHashInPages(FAVORITE_CLIENTS_KEY),
      readHashInPages(EXPORT_SURVEY_SKIPS_KEY),
      readHashInPages(SPLIT_BACKUP_KEY),
    ]);
    const archived = asArchivedSet(archivedMembers);
    const hashes = [dexHash, leagueHash, favoriteHash];
    const visits: Visit[] = TOOL_STORES.flatMap((store, i) => Object.entries(hashes[i]).flatMap(([field, raw]) => {
      const f = store.read(raw);
      if (!f) return [];
      const cid = bareCid(field);
      return [{ tool: store.tool, field, cid, firstTs: f.firstTs, lastTs: f.lastTs, country: f.country, device: f.device, counted: f.engaged && !archived.has(cid) }];
    }));

    const args = retireArgs(visits, cutoff);
    const retired: Record<ClientTool, number> = { dex: 0, league: 0, favorites: 0 };
    for (const store of TOOL_STORES) {
      const list = args.get(store.tool) ?? [];
      const lists = batches(list, (at) => 3 + Number(list[at + 1]) + Number(list[at + 2]), RECORDS_PER_EVAL);
      retired[store.tool] = await evalEach(RETIRE_RECORDS, [store.records, store.versions, retiredKey(store.tool), retiredKey('all')], lists, [String(cutoff)]);
    }

    const live = new Set(visits.filter((v) => v.lastTs >= cutoff).map((v) => v.cid));
    const gone = ([cid, lastVisit]: [string, number]) => !live.has(bareCid(cid)) && lastVisit < cutoff;
    const skipCids = Object.entries(skips).map(([cid, raw]): [string, number] => [cid, newestOrNever(parseExportSurveySkipList(raw).map((s) => s.t))]).filter(gone).map(([cid]) => cid);
    const backupCids = Object.entries(backups).map(([cid, raw]): [string, number] => [cid, backupLastVisit(raw)]).filter(gone).map(([cid]) => cid);
    const archivedCids = (archivedMembers ?? []).map(String).filter((cid) => !live.has(bareCid(cid)));
    const forget = (key: string, mode: 'hash' | 'set', cids: string[]) =>
      evalEach(FORGET_BROWSERS, [key, ...TOOL_HASHES], batches(cids, () => 1, RECORDS_PER_EVAL), [mode]);
    const forgotten = {
      skips: await forget(EXPORT_SURVEY_SKIPS_KEY, 'hash', skipCids),
      backups: await forget(SPLIT_BACKUP_KEY, 'hash', backupCids),
      archived: await forget(ARCHIVED_KEY, 'set', archivedCids),
    };

    const run: RetentionRun = { at: new Date(now).toISOString(), retired, persisted };
    await redis.set(RETENTION_LAST_RUN_KEY, JSON.stringify(run));
    return { ...run, forgotten };
  } finally {
    await redis.del(RETENTION_LOCK_KEY);
  }
}
