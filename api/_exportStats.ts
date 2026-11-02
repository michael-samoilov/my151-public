import { redis } from './_shared.js';

type ExportTool = 'pokedex' | 'league' | 'card';

interface ExportHighlight {
  ordinal: number;
  tool: ExportTool;
  firstPokemonId: number | null;
}

const EXPORT_COUNTS_KEY = 'export:counts';
const EXPORT_SEEN_KEY = 'export:seen-pokemon';
const DEX_EVER_FREQ_KEY = 'dex:ever-freq';

function pickFirstExportPokemon(
  exportIds: number[],
  alreadySeen: Iterable<number>,
  dexFreq: Record<number, number>,
): number | null {
  const seen = new Set(alreadySeen);
  const unseen = [...new Set(exportIds.filter((id) => id > 0 && !seen.has(id)))];
  if (unseen.length === 0) return null;
  unseen.sort((a, b) => (dexFreq[b] ?? 0) - (dexFreq[a] ?? 0) || a - b);
  return unseen[0];
}

const BUMP_FREQ_LUA = `
for _, id in ipairs(ARGV) do
  redis.call('HINCRBY', KEYS[1], id, 1)
end
return #ARGV
`;

export async function bumpDexPickFreq(newIds: number[]): Promise<void> {
  if (newIds.length === 0) return;
  await redis.eval(BUMP_FREQ_LUA, [DEX_EVER_FREQ_KEY], newIds.map(String));
}

function seenFlag(v: unknown): boolean {
  return v === 1 || v === true || v === '1';
}

export function parseNotmeFlag(v: unknown): boolean {
  return v === true;
}

export function isPreviewDeploy(env: string | undefined = process.env.VERCEL_ENV): boolean {
  return env === 'preview';
}

export function canRecordToolExport(
  env: string | undefined = process.env.VERCEL_ENV,
  notme = false,
): boolean {
  if (notme || isPreviewDeploy(env)) return false;
  return env === 'production';
}

export function previewExportHighlight(tool: ExportTool, pokemonIds: number[]): ExportHighlight {
  const firstPokemonId = pokemonIds.find((id) => Number.isInteger(id) && id > 0 && id < 100_000) ?? null;
  return { ordinal: 151, tool, firstPokemonId };
}

export async function recordToolExport(
  tool: ExportTool,
  pokemonIds: number[],
  opts?: { notme?: boolean },
): Promise<ExportHighlight | null> {
  if (!canRecordToolExport(process.env.VERCEL_ENV, opts?.notme === true)) {
    return previewExportHighlight(tool, pokemonIds);
  }
  try {
    const unique = [...new Set(pokemonIds.filter((id) => Number.isInteger(id) && id > 0 && id < 100_000))];
    // platform: Upstash bills every command, pipelined or not, so the export sends one SMISMEMBER and one SADD.
    const [ordinal, flags] = await Promise.all([
      redis.hincrby(EXPORT_COUNTS_KEY, tool, 1),
      unique.length === 0 ? [] : redis.smismember(EXPORT_SEEN_KEY, unique.map(String)),
    ]);
    const already = unique.filter((_, i) => seenFlag(flags[i]));
    const unseen = unique.filter((_, i) => !seenFlag(flags[i]));
    const fields = unseen.map(String);
    const [first, ...rest] = unique.map(String);
    const [raw] = await Promise.all([
      fields.length > 0 ? (redis.hmget(DEX_EVER_FREQ_KEY, fields[0], ...fields.slice(1)) as Promise<unknown>) : null,
      first !== undefined ? redis.sadd(EXPORT_SEEN_KEY, first, ...rest) : null,
    ]);
    const dexFreq: Record<number, number> = {};
    if (fields.length > 0) {
      const freqs = Array.isArray(raw) ? raw : fields.map((f) => (raw as Record<string, unknown> | null)?.[f]);
      unseen.forEach((id, i) => {
        const n = Number(freqs[i]);
        dexFreq[id] = Number.isFinite(n) ? n : 0;
      });
    }
    const firstPokemonId = pickFirstExportPokemon(unique, already, dexFreq);
    return { ordinal: Number(ordinal), tool, firstPokemonId };
  } catch (err) {
    console.error('recordToolExport', err);
    return null;
  }
}

export function parsePokemonIds(v: unknown): number[] {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v.slice(0, 600)) {
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > 99_999) continue;
    out.push(raw);
  }
  return out;
}
