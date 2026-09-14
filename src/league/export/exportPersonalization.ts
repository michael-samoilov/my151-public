import { getPokemonById } from '@/hooks/usePokemonData';
import type { GymCard } from '../store/useLeagueStore';
import { legendsOf } from '../store/useLeagueStore';

const EXPORT_COUNT_KEY = 'league-builder-export-count';

export type ExportTool = 'pokedex' | 'league' | 'card';

export interface ExportHighlight {
  ordinal: number;
  tool: ExportTool;
  firstPokemonId: number | null;
}

export const EXPORT_TOOL_LABEL: Record<ExportTool, string> = {
  pokedex: 'Pokedex',
  league: 'Pokemon League',
  card: 'Gym Leader Card',
};

/** First-N buckets for "you're among the first n users". */
export const EARLY_EXPORT_BUCKETS = [10, 50, 100, 151, 251, 500, 1000] as const;

/** Export ordinals that match national-dex generation totals. */
export const GEN_EXPORT_MILESTONES: { n: number; gen: number }[] = [
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

export function ordinalSuffix(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export function earlyExportLine(ordinal: number, tool: ExportTool): string | null {
  const label = EXPORT_TOOL_LABEL[tool];
  const milestone = GEN_EXPORT_MILESTONES.find((m) => m.n === ordinal);
  if (milestone) {
    return `You're the ${ordinalSuffix(ordinal)} person to export a ${label}. Coincidentally, that's the size of the national dex after Generation ${milestone.gen}. Lucky you!`;
  }
  const bucket = EARLY_EXPORT_BUCKETS.find((n) => ordinal <= n);
  if (!bucket) return null;
  return `You're among the first ${bucket} users to export a ${label}.`;
}

export function firstPokemonLine(pokemonName: string, tool: ExportTool): string {
  return `You're also the first person to have ${pokemonName} in an exported ${EXPORT_TOOL_LABEL[tool]}.`;
}

/**
 * Of Pokémon in this export that have never appeared in any export, pick the
 * one most often placed across Pokedex Builder entries. National-dex order
 * breaks ties.
 */
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

/** Distinct Pokémon species seated anywhere in the league (lines, legends, picks). */
export function countDistinctPokemonInLeague(cards: GymCard[]): number {
  return new Set(allSeatedIds(cards)).size;
}

export function readLeagueExportCount(): number {
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

export function pokemonDisplayName(id: number): string | null {
  const n = getPokemonById(id)?.name;
  if (!n) return null;
  return n.replace(/\S+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}
