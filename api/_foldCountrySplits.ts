import { CLIENTS_KEY, MAX_SESSIONS_TRACKED, SESSION_GAP_MS, VERSION_KEY, parseRecord, redis, type ClientRecord } from './_shared.js';
import { alignSessionMs, checkpointRecording, endStampedSpans } from './_sessionize.js';

// One-time migration: the server no longer splits a browser's Dex record by
// country, so each old `cid::COUNTRY` record folds back into its `cid` record.
export const FOLD_BACKUP_KEY = 'clients:country-split-backup';

type Session = { log: NonNullable<ClientRecord['sessionLog']>[number]; ms: number; depth: number; from: number };

function sessionsOf(r: ClientRecord, from: number): Session[] {
  const log = r.sessionLog ?? [];
  const ms = alignSessionMs(log.length, r.sessionMs ?? []);
  const depth = alignSessionMs(log.length, r.sessionDepth ?? []);
  return log.map((entry, i) => ({ log: entry, ms: ms[i], depth: depth[i], from }));
}

/** Joins sessions from different records that the server's 30-minute gap
 *  would have joined, as `sessionTarget` does for one beacon at a time. */
function joinAcrossRecords(sorted: Session[]): { sessions: Session[]; joins: number } {
  const out: Session[] = [];
  let joins = 0;
  for (const s of sorted) {
    const prev = out[out.length - 1];
    const start = s.log.ts - s.ms;
    if (prev && prev.from !== s.from && start <= prev.log.ts + SESSION_GAP_MS) {
      const later = s.log.ts >= prev.log.ts ? s : prev;
      const other = later === s ? prev : s;
      const end = Math.max(prev.log.ts, s.log.ts);
      const events = [...new Set([...(prev.log.events ?? []), ...(s.log.events ?? [])])];
      const sections = later.log.sections ?? other.log.sections;
      out[out.length - 1] = {
        log: { ...later.log, ts: end, ...(events.length ? { events } : {}), ...(sections ? { sections } : {}) },
        ms: end - Math.min(prev.log.ts - prev.ms, start),
        depth: later.depth,
        from: later.from,
      };
      joins += 1;
    } else {
      out.push(s);
    }
  }
  return { sessions: out, joins };
}

const unionSorted = (lists: number[][]) => [...new Set(lists.flat())].sort((a, b) => a - b);

/** Why a group cannot fold exactly, or null when it can. */
export function foldBlocker(base: ClientRecord | null, splits: ClientRecord[]): string | null {
  if (!base) return 'no base record';
  for (const r of [base, ...splits]) {
    if (r.sessions === undefined) return `${r.cid} predates session tracking`;
  }
  for (const s of splits) {
    if (s.attention || s.recording || s.activeDays || s.activityCoverageFrom !== undefined || s.seenDays) {
      return `${s.cid} has on-screen time fields`;
    }
    const coverage = Math.min(base.attention?.coverageFrom ?? Infinity, base.activityCoverageFrom ?? Infinity);
    if (s.lastTs >= coverage) return `${s.cid} has sessions inside the base record's measured window`;
  }
  return null;
}

/** The base record as if every split record's beacons had merged into it. */
export function foldRecords(base: ClientRecord, splits: ClientRecord[]): ClientRecord {
  const all = [base, ...splits];
  const byLast = [...all].sort((a, b) => a.lastTs - b.lastTs);
  const later = byLast[byLast.length - 1];
  const byFirst = [...all].sort((a, b) => a.firstTs - b.firstTs);

  const { sessions: merged, joins } = joinAcrossRecords(
    all.flatMap((r, i) => sessionsOf(r, i)).sort((a, b) => a.log.ts - a.ms - (b.log.ts - b.ms) || a.log.ts - b.log.ts),
  );
  const overflow = merged.length - MAX_SESSIONS_TRACKED;
  const kept = overflow > 0 ? merged.slice(overflow) : merged;
  const retiredThrough = overflow > 0 ? Math.max(...merged.slice(0, overflow).map((s) => s.log.ts)) : undefined;

  const rec: ClientRecord = { ...base };
  for (const r of byLast) {
    for (const key of ['localHour', 'localDow', 'country', 'region', 'tz', 'lang', 'locale', 'switched', 'device', 'os', 'browser', 'latestSections'] as const) {
      if (r[key] !== undefined) (rec as unknown as Record<string, unknown>)[key] = r[key];
    }
  }
  rec.cid = base.cid;
  rec.firstTs = byFirst[0].firstTs;
  rec.firstAt = byFirst[0].firstAt;
  rec.lastTs = later.lastTs;
  rec.lastAt = later.lastAt;
  rec.latestIds = later.latestIds;
  const referrer = byFirst.find((r) => r.firstReferrer)?.firstReferrer;
  if (referrer) rec.firstReferrer = referrer;
  rec.submits = all.reduce((n, r) => n + r.submits, 0);
  rec.sessions = all.reduce((n, r) => n + (r.sessions ?? 0), 0) - joins;
  rec.maxDepth = Math.max(...all.map((r) => r.maxDepth));
  rec.everIds = unionSorted(all.map((r) => r.everIds ?? []));
  const sectionIds = [...new Set(all.flatMap((r) => Object.keys(r.everSections ?? {})))];
  if (sectionIds.length) {
    rec.everSections = Object.fromEntries(sectionIds.map((sid) => [sid, [...new Set(byFirst.flatMap((r) => r.everSections?.[sid] ?? []))].slice(0, 200)]));
  }
  const completions = all.filter((r) => r.completed && r.completedAt).sort((a, b) => a.completedAt!.localeCompare(b.completedAt!));
  rec.completed = all.some((r) => r.completed);
  const lastCompletion = completions[completions.length - 1];
  if (lastCompletion) {
    rec.completedAt = lastCompletion.completedAt;
    rec.completedIds = lastCompletion.completedIds;
  }
  const exports = all.filter((r) => r.exported && r.exportedAt).sort((a, b) => a.exportedAt!.localeCompare(b.exportedAt!));
  rec.exported = all.some((r) => r.exported);
  const lastExport = exports[exports.length - 1];
  if (lastExport) {
    rec.exportedAt = lastExport.exportedAt;
    rec.exportedIds = lastExport.exportedIds;
    if (lastExport.exportSettings) rec.exportSettings = lastExport.exportSettings;
  }

  if (base.recording) {
    const fullLog = { sessionLog: merged.map((s) => s.log), sessionMs: merged.map((s) => s.ms) };
    const asOf = base.recording.asOf;
    rec.recording = checkpointRecording(base, endStampedSpans(base), endStampedSpans(fullLog), asOf, asOf, retiredThrough).recording;
  }
  rec.sessionLog = kept.map((s) => s.log);
  rec.sessionMs = kept.map((s) => s.ms);
  rec.sessionDepth = kept.map((s) => s.depth);
  rec.maxSessionMs = Math.max(...all.map((r) => r.maxSessionMs ?? 0), ...rec.sessionMs);
  const last = kept[kept.length - 1];
  if (last) rec.curSessionStart = last.log.ts - last.ms;
  return rec;
}

// Writes the backup, the folded record, and the version bump, and deletes the
// split fields, only while every version still matches what was read.
const APPLY_FOLD = `
if (redis.call('HGET', KEYS[2], ARGV[1]) or '0') ~= ARGV[2] then return 0 end
local n = tonumber(ARGV[5])
for i = 1, n do
  local f = ARGV[4 + 2 * i]
  if redis.call('HEXISTS', KEYS[1], f) == 0 or (redis.call('HGET', KEYS[2], f) or '0') ~= ARGV[5 + 2 * i] then return 0 end
end
if redis.call('HEXISTS', KEYS[3], ARGV[1]) == 1 then return 2 end
redis.call('HSET', KEYS[3], ARGV[1], ARGV[4])
redis.call('HSET', KEYS[1], ARGV[1], ARGV[3])
redis.call('HSET', KEYS[2], ARGV[1], tostring(tonumber(ARGV[2]) + 1))
for i = 1, n do
  local f = ARGV[4 + 2 * i]
  redis.call('HDEL', KEYS[1], f)
  redis.call('HDEL', KEYS[2], f)
end
return 1
`;

type GroupResult = {
  cid: string;
  splits: string[];
  status: 'would-fold' | 'folded' | 'skipped' | 'conflict' | 'already-backed-up';
  reason?: string;
  backup: { base: unknown; baseVersion: string; splits: Record<string, { record: unknown; version: string }> };
  folded?: ClientRecord;
};

/** Dry run unless `apply` is true. A rerun finds no split fields and does nothing. */
export async function foldCountrySplits(apply: boolean): Promise<GroupResult[]> {
  const fields = ((await redis.hkeys(CLIENTS_KEY)) ?? []).map(String);
  const groups = new Map<string, string[]>();
  for (const f of fields) {
    const i = f.indexOf('::');
    if (i > 0) groups.set(f.slice(0, i), [...(groups.get(f.slice(0, i)) ?? []), f]);
  }
  const results: GroupResult[] = [];
  for (const [cid, splitFields] of groups) {
    const keys = [cid, ...splitFields];
    // Versions before content: a write between the two reads then fails the
    // version check in APPLY_FOLD instead of being overwritten.
    const versions = await redis.hmget<Record<string, unknown>>(VERSION_KEY, ...keys);
    const raws = await redis.hmget<Record<string, unknown>>(CLIENTS_KEY, ...keys);
    const version = (k: string) => (versions?.[k] == null ? '0' : String(versions[k]));
    const backup = {
      base: raws?.[cid] ?? null,
      baseVersion: version(cid),
      splits: Object.fromEntries(splitFields.map((f) => [f, { record: raws?.[f] ?? null, version: version(f) }])),
    };
    const base = parseRecord(raws?.[cid]);
    const splits = splitFields.map((f) => parseRecord(raws?.[f])).filter((r): r is ClientRecord => r !== null);
    const blocker = splits.length !== splitFields.length ? 'unreadable split record' : foldBlocker(base, splits);
    if (blocker || !base) {
      results.push({ cid, splits: splitFields, status: 'skipped', reason: blocker ?? 'no base record', backup });
      continue;
    }
    const folded = foldRecords(base, splits);
    if (!apply) {
      results.push({ cid, splits: splitFields, status: 'would-fold', backup, folded });
      continue;
    }
    const args = [cid, backup.baseVersion, JSON.stringify(folded), JSON.stringify({ at: Date.now(), ...backup }), String(splitFields.length),
      ...splitFields.flatMap((f) => [f, backup.splits[f].version])];
    const outcome = Number(await redis.eval(APPLY_FOLD, [CLIENTS_KEY, VERSION_KEY, FOLD_BACKUP_KEY], args));
    const status = outcome === 1 ? 'folded' : outcome === 2 ? 'already-backed-up' : 'conflict';
    results.push({ cid, splits: splitFields, status, backup, folded });
  }
  return results;
}
