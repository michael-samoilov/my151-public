import { PARADOX_IDS } from '@/data/categories';
import type { GenAxisId, TypeAxisId } from './cells';
import {
  comparePickerOrder,
  CONVERGENT_IDS,
  getPickerMon,
  isGimmickForm,
  isLegendaryEligible,
  isRegionalFamily,
  type PickerMon,
} from './catalog';
import { debutRank } from './debut';

/** The selector a list is sorted for. Some keys apply to one cell only. */
type SortCell = { type: TypeAxisId; gen: GenAxisId };

type Compare = (a: PickerMon, b: PickerMon, cell: SortCell) => number;

/** Native families precede arrivals from older generations within each section. */
export function regionalPickerTier(mon: PickerMon): number {
  const legendary = isLegendaryEligible(mon);
  const owner = getPickerMon(mon.ownerId);
  const olderFamily = isRegionalFamily(mon) || (owner != null && owner.generation < mon.generation);
  if (legendary) return 3 + Number(olderFamily);
  if (PARADOX_IDS.has(mon.id) || CONVERGENT_IDS.has(mon.id)) return 2;
  return Number(olderFamily);
}

/**
 * Battle forms outside the Gimmick candidate set: forms that exist only in
 * battle through a held item or Dynamax.
 */
const OTHER_BATTLE_FORM_IDS = new Set([
  10190, // Eternamax Eternatus
]);

/**
 * Mega Evolution, Primal Reversion, Gigantamax, Terastal and Stellar
 * Terapagos, Ultra Necrozma, and Eternamax. Forms that an
 * ability changes during battle, such as Aegislash Blade, are not included.
 */
export function isBattleForm(mon: PickerMon): boolean {
  return isGimmickForm(mon) || OTHER_BATTLE_FORM_IDS.has(mon.id);
}

/**
 * The entry whose debut game a form sorts by. A form in its species'
 * generation row sits with the species, even when the form came in a later
 * game of another region: Hoopa Unbound (Omega Ruby and Alpha Sapphire)
 * sorts with Hoopa (X and Y), not after Volcanion. Regional forms and battle
 * forms keep their own debut, which their own sort layers expect.
 */
function debutAnchor(mon: PickerMon): PickerMon {
  if (mon.ownerId === mon.id || isBattleForm(mon) || isRegionalFamily(mon)) return mon;
  const owner = getPickerMon(mon.ownerId);
  return owner != null && owner.generation === mon.generation ? owner : mon;
}

/** The debut rank a selector sorts by, from `debutAnchor`. */
export function debutSortRank(mon: PickerMon): number {
  return debutRank(debutAnchor(mon));
}

/** Entries that fail `test` first. */
function lastIf(test: (mon: PickerMon) => boolean) {
  return (a: PickerMon, b: PickerMon) => Number(test(a)) - Number(test(b));
}

const unownLast = lastIf((mon) => mon.ownerId === 201);
const hisuiLast = lastIf((mon) => mon.name.endsWith('-hisui'));

export const SORT_KEYS = [
  {
    id: 'unownLast',
    label: 'Unown last',
    description: 'Psychic × Gen 2 and 3 only: Unown letters go last.',
    compare: (a, b, { type, gen }) => (type === 'psychic' && (gen === 2 || gen === 3) ? unownLast(a, b) : 0),
  },
  {
    id: 'debut',
    label: 'Debut game',
    description: 'Earlier games first. Games of one generation and region count as one: Black 2 and White 2 sort with Black and White, but Legends: Arceus sorts after Sword and Shield. A form sorts with its species in the same generation, except regional and battle forms.',
    compare: (a, b) => debutSortRank(a) - debutSortRank(b)
      // Within one species, forms still follow their own debut.
      || (a.ownerId === b.ownerId ? debutRank(a) - debutRank(b) : 0),
  },
  {
    id: 'formKind',
    label: 'Battle forms last',
    description: 'Regional and other forms before Mega, Gigantamax, and other battle forms.',
    compare: lastIf(isBattleForm),
  },
  {
    id: 'legendaryLast',
    label: 'Legendaries last',
    description: 'Legendary, Mythical, Ultra Beast, and legendary Paradox Pokémon go last.',
    compare: lastIf(isLegendaryEligible),
  },
  {
    id: 'tier',
    label: 'Family tier',
    description: 'Native, regional or older family, Paradox, legendary. Not for starters.',
    compare: (a, b, { type }) => (type === 'starter' ? 0 : regionalPickerTier(a) - regionalPickerTier(b)),
  },
  {
    id: 'hisuiStartersLast',
    label: 'Hisuian starters last',
    description: 'Starter × Gen 8 only: Galar starters before Hisuian ones.',
    compare: (a, b, { type, gen }) => (type === 'starter' && gen === 8 ? hisuiLast(a, b) : 0),
  },
] as const satisfies readonly { id: string; label: string; description: string; compare: Compare }[];

export type SortKeyId = (typeof SORT_KEYS)[number]['id'];
type SortKey = (typeof SORT_KEYS)[number];

/** The final tie-break. It always applies, after every enabled key. */
export const DEX_KEY = {
  id: 'dex',
  label: 'Dex order',
  description: 'Evolution line, stage, then species number. Always the final tie-break.',
} as const;

/** Enabled keys, first to last. `dex` is implied at the end. */
export type SortOrder = readonly SortKeyId[];

const KEY_BY_ID = new Map<string, SortKey>(SORT_KEYS.map((key) => [key.id, key]));

export function sortKey(id: SortKeyId): SortKey {
  return KEY_BY_ID.get(id)!;
}

export const DEFAULT_SORT_ORDER: SortOrder = ['unownLast', 'debut', 'formKind', 'tier'];

export const SORT_PRESETS: readonly { id: string; label: string; order: SortOrder }[] = [
  { id: 'default', label: 'Default', order: DEFAULT_SORT_ORDER },
  // The order before selectors sorted by debut game (commit 2f71f079).
  { id: 'before-debut', label: 'Before debut order', order: ['unownLast', 'hisuiStartersLast', 'tier'] },
  { id: 'legendaries-last', label: 'Legendaries last', order: ['unownLast', 'legendaryLast', 'debut', 'formKind', 'tier'] },
  { id: 'regional-first', label: 'Regional first', order: ['unownLast', 'formKind', 'debut', 'tier'] },
];

export function sortComparator(order: SortOrder, cell: SortCell): (a: PickerMon, b: PickerMon) => number {
  const compares: Compare[] = order.map((id) => sortKey(id).compare);
  return (a, b) => {
    // Non-gimmick battle forms belong to their species group. Classification
    // still describes their battle behavior; it does not define family position.
    const anchor = (mon: PickerMon) => OTHER_BATTLE_FORM_IDS.has(mon.id)
      ? getPickerMon(mon.ownerId) ?? mon : mon;
    const sameSpecies = a.ownerId === b.ownerId;
    const left = sameSpecies ? a : anchor(a);
    const right = sameSpecies ? b : anchor(b);
    for (const compare of compares) {
      const result = compare(left, right, cell);
      if (result !== 0) return result;
    }
    return comparePickerOrder(left, right) || comparePickerOrder(a, b);
  };
}

/** The order as a comma list, `dex` included, for a URL or a message. */
export function formatSortOrder(order: SortOrder): string {
  return [...order, DEX_KEY.id].join(',');
}

/**
 * Reads a comma list. Unknown and repeated IDs are dropped, and `dex` is
 * always last. Returns null when the list names no key at all.
 */
export function parseSortOrder(text: string): SortOrder | null {
  const ids = [...new Set(text.split(',').map((part) => part.trim()))];
  if (!ids.some((id) => id === DEX_KEY.id || KEY_BY_ID.has(id))) return null;
  return ids.filter((id): id is SortKeyId => KEY_BY_ID.has(id));
}

export function sameSortOrder(a: SortOrder, b: SortOrder): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}
