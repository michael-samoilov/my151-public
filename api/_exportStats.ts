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

export type ExportTool = 'pokedex' | 'league' | 'card';

export interface ExportHighlight {
  ordinal: number;
  tool: ExportTool;
  firstPokemonId: number | null;
}

export const EXPORT_COUNTS_KEY = 'export:counts';
export const EXPORT_SEEN_KEY = 'export:seen-pokemon';
export const DEX_EVER_FREQ_KEY = 'dex:ever-freq';

const TOOLS: ExportTool[] = ['pokedex', 'league', 'card'];

export function isExportTool(s: unknown): s is ExportTool {
  return typeof s === 'string' && (TOOLS as string[]).includes(s);
}

export function pickFirstExportPokemon(
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

export async function bumpDexPickFreq(newIds: number[]): Promise<void> {
  if (newIds.length === 0) return;
  const pipe = redis.pipeline();
  for (const id of newIds) pipe.hincrby(DEX_EVER_FREQ_KEY, String(id), 1);
  await pipe.exec();
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
    const flags =
      unique.length === 0
        ? []
        : await Promise.all(unique.map((id) => redis.sismember(EXPORT_SEEN_KEY, String(id))));
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
      const pipe = redis.pipeline();
      for (const id of unique) pipe.sadd(EXPORT_SEEN_KEY, String(id));
      await pipe.exec();
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
