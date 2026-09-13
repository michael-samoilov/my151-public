import { getPokemonById } from '@/hooks/usePokemonData';
import type { GymCard } from '../store/useLeagueStore';
import { legendsOf } from '../store/useLeagueStore';

const EXPORT_COUNT_KEY = 'league-builder-export-count';

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

/** Evolution-line names (base species) represented by at least two stages in this league. */
export function featuredEvoLinesInLeague(cards: GymCard[], max = 3): string[] {
  const byChain = new Map<number, Set<number>>();
  for (const id of allSeatedIds(cards)) {
    const p = getPokemonById(id);
    if (!p) continue;
    const set = byChain.get(p.evolutionChainId) ?? new Set();
    set.add(id);
    byChain.set(p.evolutionChainId, set);
  }
  const names: string[] = [];
  for (const ids of byChain.values()) {
    if (ids.size < 2) continue;
    const sorted = [...ids].sort((a, b) => a - b);
    const base = getPokemonById(sorted[0]);
    if (base) names.push(`${base.name} line`);
    if (names.length >= max) break;
  }
  return names;
}

export type ExportUniquenessHighlight = { kind: 'early' | 'species' | 'evoLines'; text: string };

/** Copy for the post-export intro step — what makes this export feel personal. */
export function buildExportUniquenessHighlights(
  cards: GymCard[],
  exportKind: 'league' | 'card',
): ExportUniquenessHighlight[] {
  const count = readLeagueExportCount();
  const out: ExportUniquenessHighlight[] = [];

  if (count <= 1) {
    out.push({
      kind: 'early',
      text: `You're among the first people to export a ${exportKind === 'league' ? 'league summary' : 'trainer card'} from this browser.`,
    });
  } else if (count <= 5) {
    out.push({
      kind: 'early',
      text: `You're in the top ${count} exporters of this tool on this device.`,
    });
  } else if (count <= 20) {
    out.push({
      kind: 'early',
      text: `You've exported ${count} times from this browser — you're in our most active group here.`,
    });
  }

  const species = countDistinctPokemonInLeague(cards);
  if (species > 0 && exportKind === 'league') {
    out.push({
      kind: 'species',
      text: `This league lists ${species} different Pokémon species — your roster choices are what make the image yours.`,
    });
  }

  const lines = featuredEvoLinesInLeague(cards);
  if (lines.length > 0 && exportKind === 'league') {
    const joined =
      lines.length === 1
        ? lines[0]
        : lines.length === 2
          ? `${lines[0]} and ${lines[1]}`
          : `${lines[0]}, ${lines[1]}, and ${lines[2]}`;
    out.push({
      kind: 'evoLines',
      text: `Your export spans full evolution arcs (${joined}) — not every league does.`,
    });
  }

  return out;
}
