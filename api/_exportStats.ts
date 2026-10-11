/**
 * Global export uniqueness: per-tool ordinals, the set of Pokémon that have
 * already appeared in an export, and Pokedex Builder placement frequency.
 *
 * Redis keys:
 *   export:counts          hash  tool -> ordinal
 *   export:seen-pokemon    set   pokemon ids that have been exported
 *   dex:ever-freq          hash  pokemon id -> client count (ever placed)
 */
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

// One script call for the whole batch: a pipeline of HINCRBY is still billed
// one command per Pokémon, and a first full build places 151 at once.
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

/** Writes uniqueness only on the live site. A Vercel preview, local, any other
 *  `VERCEL_ENV`, and an owner `notme` request must not increment
 *  `export:counts` or add to `export:seen-pokemon`. */
export function canRecordToolExport(
  env: string | undefined = process.env.VERCEL_ENV,
  notme = false,
): boolean {
  if (notme || isPreviewDeploy(env)) return false;
  return env === 'production';
}

/** Same shape the live recorder returns, without touching Redis. */
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
    const ordinal = await redis.hincrby(EXPORT_COUNTS_KEY, tool, 1);
    // One SMISMEMBER and one SADD for the whole export, not one per Pokémon:
    // Upstash bills every command, pipelined or not.
    const flags: unknown[] =
      unique.length === 0 ? [] : await redis.smismember(EXPORT_SEEN_KEY, unique.map(String));
    const already = unique.filter((_, i) => seenFlag(flags[i]));
    const unseen = unique.filter((_, i) => !seenFlag(flags[i]));
    const dexFreq: Record<number, number> = {};
    if (unseen.length > 0) {
      const fields = unseen.map(String);
      const raw = (await redis.hmget(DEX_EVER_FREQ_KEY, fields[0], ...fields.slice(1))) as unknown;
      const freqs = Array.isArray(raw) ? raw : fields.map((f) => (raw as Record<string, unknown> | null)?.[f]);
      unseen.forEach((id, i) => {
        const n = Number(freqs[i]);
        dexFreq[id] = Number.isFinite(n) ? n : 0;
      });
    }
    const firstPokemonId = pickFirstExportPokemon(unique, already, dexFreq);
    if (unique.length > 0) {
      const [first, ...rest] = unique.map(String);
      await redis.sadd(EXPORT_SEEN_KEY, first, ...rest);
    }
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
