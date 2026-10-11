import { getLocale, t, type MessageKey } from '@/i18n';
import type { GymCard } from '../store/useLeagueStore';
import { legendsOf } from '../model/cardPicks';

const EXPORT_COUNT_KEY = 'league-builder-export-count';

export type ExportTool = 'pokedex' | 'league' | 'card';

export interface ExportHighlight {
  ordinal: number;
  tool: ExportTool;
  firstPokemonId: number | null;
}

const BUCKET_LINE = {
  pokedex: 'exportSurvey.early.bucket.pokedex',
  league: 'exportSurvey.early.bucket.league',
  card: 'exportSurvey.early.bucket.card',
} as const satisfies Record<ExportTool, MessageKey>;

const MILESTONE_LINE = {
  pokedex: 'exportSurvey.early.milestone.pokedex',
  league: 'exportSurvey.early.milestone.league',
  card: 'exportSurvey.early.milestone.card',
} as const satisfies Record<ExportTool, MessageKey>;

/** Whole sentences per tool, with `{name}` where the Pokémon goes. */
export const FIRST_POKEMON_LINE = {
  pokedex: 'exportSurvey.firstPokemon.pokedex',
  league: 'exportSurvey.firstPokemon.league',
  card: 'exportSurvey.firstPokemon.card',
} as const satisfies Record<ExportTool, MessageKey>;

/** First-N buckets for "you're among the first n users". */
export const EARLY_EXPORT_BUCKETS = [10, 50, 100, 151, 251, 500, 1000] as const;

/** Export ordinals that match national-dex generation totals. */
const GEN_EXPORT_MILESTONES: { n: number; gen: number }[] = [
  { n: 151, gen: 1 },
  { n: 251, gen: 2 },
  { n: 386, gen: 3 },
  { n: 493, gen: 4 },
  { n: 649, gen: 5 },
  { n: 721, gen: 6 },
  { n: 809, gen: 7 },
  { n: 905, gen: 8 },
  { n: 1025, gen: 9 },
];

/**
 * An ordinal in the active locale: 151st, 151., 151人目. The locale's ordinal
 * rule picks the pattern. Export milestones start at 151, where every
 * non-English locale's rule says `other`, so those catalogs carry only
 * `exportSurvey.ordinal_other`.
 */
export function ordinalNumber(n: number): string {
  const rule = new Intl.PluralRules(getLocale(), { type: 'ordinal' }).select(n);
  const key = rule === 'one' || rule === 'two' || rule === 'few'
    ? (`exportSurvey.ordinal_${rule}` as const)
    : 'exportSurvey.ordinal_other';
  return t(key, { count: n });
}

export function earlyExportLine(ordinal: number, tool: ExportTool): string | null {
  const milestone = GEN_EXPORT_MILESTONES.find((m) => m.n === ordinal);
  if (milestone) {
    return t(MILESTONE_LINE[tool], { ordinal: ordinalNumber(ordinal), gen: milestone.gen });
  }
  const bucket = EARLY_EXPORT_BUCKETS.find((n) => ordinal <= n);
  if (!bucket) return null;
  return t(BUCKET_LINE[tool], { count: bucket });
}

export function firstPokemonLine(pokemonName: string, tool: ExportTool): string {
  return t(FIRST_POKEMON_LINE[tool], { name: pokemonName });
}

/**
 * Preview and local testing still show the early-export copy, but they must
 * not consume production uniqueness. 151 is a generation milestone, so the
 * intro includes the "Lucky you!" line; the first seated id stands in for a
 * first-Pokémon highlight.
 */
export function previewExportHighlight(tool: ExportTool, pokemonIds: number[]): ExportHighlight {
  const firstPokemonId = pokemonIds.find((id) => Number.isInteger(id) && id > 0) ?? null;
  return { ordinal: 151, tool, firstPokemonId };
}

/**
 * Demo / preview clients never POST an export beacon. They still need the
 * intro copy, so an export in demo mode uses `previewExportHighlight` instead
 * of the network. Progress beacons stay silent.
 */
export function exportBeaconPlan(opts: {
  demo: boolean;
  optedOut: boolean;
  kind: 'progress' | 'export';
}): 'skip' | 'preview' | 'network' {
  if (opts.demo) return opts.kind === 'export' ? 'preview' : 'skip';
  if (opts.optedOut) return opts.kind === 'export' ? 'network' : 'skip';
  return 'network';
}

function allSeatedIds(cards: GymCard[]): number[] {
  const ids: number[] = [];
  for (const card of cards) {
    for (const line of card.lines) {
      for (const id of line.branch) ids.push(id);
    }
    for (const leg of legendsOf(card)) ids.push(leg.pokemonId);
    if (card.partnerId != null) ids.push(card.partnerId);
    if (card.signatureId != null) ids.push(card.signatureId);
  }
  return ids;
}

/** Distinct Pokémon ids that appear on these cards (export uniqueness). */
export function exportPokemonIds(cards: GymCard[]): number[] {
  return [...new Set(allSeatedIds(cards).filter((id) => id > 0))];
}

function readLeagueExportCount(): number {
  try {
    const raw = localStorage.getItem(EXPORT_COUNT_KEY);
    const n = raw === null ? 0 : Number.parseInt(raw, 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

/** Returns the count after incrementing. */
export function incrementLeagueExportCount(): number {
  const next = readLeagueExportCount() + 1;
  try {
    localStorage.setItem(EXPORT_COUNT_KEY, String(next));
  } catch {
    /* quota or private mode */
  }
  return next;
}

export function pokemonDisplayName(name: string): string {
  return name.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
