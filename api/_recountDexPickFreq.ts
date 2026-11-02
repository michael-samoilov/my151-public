import { CLIENTS_KEY, parseRecord, redis, type ClientRecord } from './_shared.js';

const FREQ_KEY = 'dex:ever-freq';
const SPLIT_BACKUP_KEY = 'clients:country-split-backup';
export const FREQ_BACKUP_KEY = 'dex:ever-freq:before-split-fix';

type SplitBackup = { base: unknown; splits: Record<string, { record: unknown }> };

export function splitOvercount(backups: Record<string, unknown>): Map<string, number> {
  const over = new Map<string, number>();
  for (const raw of Object.values(backups)) {
    const backup = (typeof raw === 'string' ? JSON.parse(raw) : raw) as SplitBackup;
    const records = [backup.base, ...Object.values(backup.splits).map((s) => s.record)]
      .map(parseRecord)
      .filter((r): r is ClientRecord => r !== null);
    const inRecords = new Map<string, number>();
    for (const r of records) for (const id of new Set(r.everIds ?? [])) inRecords.set(String(id), (inRecords.get(String(id)) ?? 0) + 1);
    for (const [id, n] of inRecords) if (n > 1) over.set(id, (over.get(id) ?? 0) + n - 1);
  }
  return over;
}

export function recountFromRecords(clients: Record<string, unknown>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const raw of Object.values(clients)) {
    for (const id of new Set(parseRecord(raw)?.everIds ?? [])) counts.set(String(id), (counts.get(String(id)) ?? 0) + 1);
  }
  return counts;
}

const APPLY_RECOUNT = `
if redis.call('EXISTS', KEYS[2]) == 1 then return -1 end
local all = redis.call('HGETALL', KEYS[1])
for i = 1, #all, 2 do redis.call('HSET', KEYS[2], all[i], all[i + 1]) end
for i = 1, #ARGV, 2 do redis.call('HINCRBY', KEYS[1], ARGV[i], ARGV[i + 1]) end
return #ARGV / 2
`;

export async function recountDexPickFreq(apply: boolean) {
  const [current, clients, backups] = await Promise.all([
    redis.hgetall<Record<string, unknown>>(FREQ_KEY),
    redis.hgetall<Record<string, unknown>>(CLIENTS_KEY),
    redis.hgetall<Record<string, unknown>>(SPLIT_BACKUP_KEY),
  ]);
  const over = splitOvercount(backups ?? {});
  const recount = recountFromRecords(clients ?? {});
  const ids = new Set([...Object.keys(current ?? {}), ...recount.keys(), ...over.keys()]);
  const mismatches = [...ids]
    .map((id) => ({ id, current: Number(current?.[id] ?? 0), over: over.get(id) ?? 0, recount: recount.get(id) ?? 0 }))
    .filter((m) => m.current - m.over !== m.recount);
  const changes = [...over].map(([id, extra]) => ({ id, before: Number(current?.[id] ?? 0), after: Number(current?.[id] ?? 0) - extra }));
  const summary = {
    pokemon: ids.size,
    overcountPokemon: over.size,
    overcountTotal: [...over.values()].reduce((a, b) => a + b, 0),
    mismatchCount: mismatches.length,
    mismatches: mismatches.slice(0, 50),
    changes,
  };
  if (!apply) return { status: 'dry-run' as const, ...summary };
  if (mismatches.length > 0 || over.size === 0) return { status: 'refused' as const, ...summary };
  const args = [...over].flatMap(([id, extra]) => [id, String(-extra)]);
  const outcome = Number(await redis.eval(APPLY_RECOUNT, [FREQ_KEY, FREQ_BACKUP_KEY], args));
  return { status: outcome === -1 ? ('already-applied' as const) : ('applied' as const), ...summary };
}
