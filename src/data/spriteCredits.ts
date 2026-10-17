import attribution from './spriteAttribution.json';
import { allPickerMons, comparePickerOrder, type PickerMon } from '@/favorites/model/catalog';
import { artistLinks } from './creditTerms';

const OWN_UPLOAD = 'own upload';

interface AttributionFile {
  sprites: Record<string, { via: string; artists?: string[] }>;
}

const DATA = attribution as unknown as AttributionFile;

export interface CreditedSprite {
  mon: PickerMon;
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
      list.push({ mon });
    }
  }
  const artists = new Map<string, ArtistCredit>();
  for (const name of [...direct.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))) {
    artists.set(name, { name, links: artistLinks(name), sprites: direct.get(name)!.sort(dexOrder) });
  }
  return { artists, sources };
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
