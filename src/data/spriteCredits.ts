/**
 * Where the app's sprite files came from, for the footer's Acknowledgements
 * panel.
 *
 * The panel credits sprites the way other users of these bundles do (Michael,
 * 2026-10-13): through the bundle each file came from (PokéAPI and the
 * Generation 9 Resource Pack) and the Smogon Sprite Project,
 * whose artists drew most of them, under each bundle's own permission. Only
 * an artist whose sprites the app took from the artist directly, not through
 * a bundle, has an entry of their own. docs/credits/README.md has the policy.
 *
 * `spriteAttribution.json` holds one row per fan-made sprite file, keyed by
 * the name the file is served under: its artists and the source it came
 * through (`via`). Its per-artist detail, and docs/credits/sprite-evidence.*,
 * are the internal evidence behind these credits. The build ships only the
 * rows the panel reads: the direct uploads, with their artists, and the
 * Generation 9 Resource Pack's rows (see `scripts/acknowledgements-build.ts`).
 *
 * `scripts/check-sprite-revisions.mjs` fails when a sprite file is added or
 * replaced without a row, or when a row names a missing file.
 */
import attribution from './spriteAttribution.json';
import { allPickerMons, comparePickerOrder, type PickerMon } from '@/favorites/model/catalog';
import { artistLinks } from './creditTerms';

/** A sprite its artist posted, rather than one that came through a bundle. */
const OWN_UPLOAD = 'own upload';

interface AttributionFile {
  /** The rows the build ships: each one's source, and the artists of a direct upload. */
  sprites: Record<string, { via: string; artists?: string[] }>;
}

const DATA = attribution as unknown as AttributionFile;

/** One sprite in an artist's entry. */
export interface CreditedSprite {
  mon: PickerMon;
}

export interface ArtistCredit {
  name: string;
  links: readonly string[];
  /** In national dex order, then form order. */
  sprites: readonly CreditedSprite[];
}

/** The file name a sprite is served under, without `.png` and the `?v=` revision. */
const spriteFile = (sprite: string) => sprite.replace(/^.*\/|\.png(\?.*)?$/g, '');

const dexOrder = (a: CreditedSprite, b: CreditedSprite) => a.mon.ownerId - b.mon.ownerId || comparePickerOrder(a.mon, b.mon);

interface Parsed {
  artists: Map<string, ArtistCredit>;
  /** The sources that rows name for at least one of the app's sprite files. */
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

/** Every artist whose sprites the app took from them directly, by name. */
export function spriteArtists(): readonly ArtistCredit[] {
  return [...data().artists.values()];
}

export function artistCredit(name: string): ArtistCredit | undefined {
  return data().artists.get(name);
}

/** Whether a row names this source for one of the app's sprite files. */
export function hasSpriteRows(source: string): boolean {
  return data().sources.has(source);
}
