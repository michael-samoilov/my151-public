import attribution from './spriteAttribution.json';
import bundleCredits from './bundleCredits.json';
import { allPickerMons, comparePickerOrder, type PickerMon } from '@/favorites/model/catalog';
import { artistLinks } from './creditTerms';

const OWN_UPLOAD = 'own upload';

interface AttributionFile {
  sprites: Record<string, { via: string; artists?: string[]; changedBy?: string }>;
}

const DATA = attribution as unknown as AttributionFile;

export interface CreditedSprite {
  mon: PickerMon;
  /** my151 changed pixels of the artist's file; the row's evidence lists them. */
  changed: boolean;
}

export interface ArtistCredit {
  name: string;
  links: readonly string[];
  sprites: readonly CreditedSprite[];
}

const spriteFile = (sprite: string) => sprite.replace(/^.*\/|\.png(\?.*)?$/g, '');

const dexOrder = (a: CreditedSprite, b: CreditedSprite) => a.mon.ownerId - b.mon.ownerId || comparePickerOrder(a.mon, b.mon);

interface Parsed {
  artists: Map<string, ArtistCredit>;
  sources: Set<string>;
  monByFile: Map<string, PickerMon>;
}

function parse(): Parsed {
  const monByFile = new Map(allPickerMons().map((mon) => [spriteFile(mon.sprite), mon] as const));
  const sources = new Set<string>();
  const direct = new Map<string, CreditedSprite[]>();
  for (const [file, mon] of monByFile) {
    const row = DATA.sprites[file];
    if (!row) continue;
    sources.add(row.via);
    if (row.via !== OWN_UPLOAD) continue;
    for (const artist of row.artists ?? []) {
      const list = direct.get(artist) ?? [];
      direct.set(artist, list);
      list.push({ mon, changed: row.changedBy === 'my151' });
    }
  }
  const artists = new Map<string, ArtistCredit>();
  for (const name of [...direct.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))) {
    artists.set(name, { name, links: artistLinks(name), sprites: direct.get(name)!.sort(dexOrder) });
  }
  return { artists, sources, monByFile };
}

let parsed: Parsed | undefined;
const data = () => (parsed ??= parse());

export function spriteArtists(): readonly ArtistCredit[] {
  return [...data().artists.values()];
}

export function artistCredit(name: string): ArtistCredit | undefined {
  return data().artists.get(name);
}

export function hasSpriteRows(source: string): boolean {
  return data().sources.has(source);
}

/**
 * A bundle's share of the app's fan-made sprite files, from
 * scripts/credits/bundle-credits.ts: each file counts under one entry, and an
 * artist counts a file only when the ledger confirms it.
 */
export interface BundleCredit {
  sprites: number;
  unconfirmed: number;
  /** [artist, files], most files first, ties by name. */
  artists: [string, number][];
  /** Each artist's files that my151 changed, by file id. */
  changed?: Record<string, string[]>;
}

/** The shown files that PokéAPI delivers: Game Freak's, the Smogon Sprite Project's, and its own. */
export interface PokeApiDelivery {
  official: number;
  smogon: number;
  own: number;
}

const BUNDLES = bundleCredits as unknown as {
  entries: Record<string, BundleCredit>;
  pokeapi: PokeApiDelivery;
  links: Record<string, string>;
};

export const bundleCredit = (id: string): BundleCredit | undefined => BUNDLES.entries[id];

export const pokeapiDelivery = (): PokeApiDelivery => BUNDLES.pokeapi;

/** An artist's sprites in a bundle that my151 changed, in Pokédex order. */
export function changedSprites(entry: BundleCredit, name: string): CreditedSprite[] {
  return (entry.changed?.[name] ?? [])
    .flatMap((file) => {
      const mon = data().monByFile.get(file);
      return mon ? [{ mon, changed: true }] : [];
    })
    .sort(dexOrder);
}

/** An artist's profile, only where it is proven to be theirs. */
export const artistProfile = (name: string): string | undefined => BUNDLES.links[name];

/** The bundles that credit an artist, most files first. */
export function bundlesCrediting(name: string, ids: readonly string[]): [string, number][] {
  return ids
    .flatMap((id): [string, number][] => {
      const files = BUNDLES.entries[id]?.artists.find(([artist]) => artist === name)?.[1];
      return files ? [[id, files]] : [];
    })
    .sort((a, b) => b[1] - a[1]);
}
