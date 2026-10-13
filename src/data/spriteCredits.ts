/**
 * Where the app's sprite files came from, for the footer's Acknowledgements
 * panel.
 *
 * The panel credits sprites the way other users of these bundles do (Michael,
 * 2026-10-13): through the bundle each file came from (PokéAPI, Pokémon
 * Showdown, the Generation 9 Resource Pack) and the Smogon Sprite Project,
 * whose artists drew most of them, under each bundle's own permission. Only
 * an artist whose sprites the app took from the artist directly, not through
 * a bundle, has an entry of their own. docs/credits/README.md has the policy.
 *
 * `spriteAttribution.json` holds one row per fan-made sprite file, keyed by
 * the name the file is served under: its artists and the source it came
 * through (`via`). Its per-artist detail, and docs/credits/sprite-evidence.*,
 * are the internal evidence behind these credits. The build keeps only what
 * the panel reads (see `scripts/acknowledgements-build.ts`).
 *
 * `scripts/check-sprite-revisions.mjs` fails when a sprite file is added or
 * replaced without a row, or when a row names a missing file.
 */
import attribution from './spriteAttribution.json';
import { allPickerMons, comparePickerOrder, getPickerMon, type PickerMon } from '@/favorites/model/catalog';
import { ALTERNATE_PICKER_FORMS } from '@/favorites/model/alternateForms';
import { artistLinks } from './creditTerms';

/** A sprite its artist posted, rather than one that came through a bundle. */
const OWN_UPLOAD = 'own upload';

/** The panel entry each bundle `via` of the rows belongs to. Smogon's four credit sheets are one project. */
const SMOGON = new Set(['smogon-gen6', 'smogon-gen7', 'smogon-gen8', 'smogon-gen9']);
const PACK = 'gen9-resource-pack';

interface AttributionFile {
  /** Every row's source, and the artists of a row the app took from them directly. */
  sprites: Record<string, { via: string; artists?: string[] }>;
  /** Files that came through no bundle, so no bundle counts them. */
  uncounted?: string[];
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

/**
 * The sprite files the app took from Pokémon Showdown's Gen 5 folder: each
 * picker form that names a Showdown file (`spriteSlug`, fetched by
 * scripts/fetch-favorite-picker-sprites.ts), and the base Vivillon, whose
 * Meadow drawing is Showdown's svivillon.png (commit 9c79b5fb).
 */
const FROM_POKEAPI_BW = new Set([
  // alternateForms.ts: taken from PokéAPI's Black/White female folder, which
  // matches Showdown's art, because Showdown was unreachable from the build.
  11094, 11095,
]);
const showdownFiles = () => new Set(
  [...ALTERNATE_PICKER_FORMS.filter((form) => form.spriteSlug && !FROM_POKEAPI_BW.has(form.id)).map((form) => getPickerMon(form.id)), getPickerMon(666)]
    .filter((mon): mon is PickerMon => mon !== undefined)
    .map((mon) => spriteFile(mon.sprite)),
);

interface Parsed {
  artists: Map<string, ArtistCredit>;
  /** How many of the app's sprite files came through each bundle entry. */
  through: Map<string, number>;
  /** How many of the app's sprites the Smogon Sprite Project's artists drew. */
  smogonDrew: number;
}

function parse(): Parsed {
  const files = [...new Set(allPickerMons().map((mon) => spriteFile(mon.sprite)))];
  const monByFile = new Map(allPickerMons().map((mon) => [spriteFile(mon.sprite), mon] as const));
  const showdown = showdownFiles();
  const uncounted = new Set(DATA.uncounted ?? []);
  const through = new Map<string, number>();
  const add = (entry: string) => through.set(entry, (through.get(entry) ?? 0) + 1);
  const direct = new Map<string, CreditedSprite[]>();
  let smogonDrew = 0;
  for (const file of files) {
    const row = DATA.sprites[file];
    if (row && SMOGON.has(row.via)) smogonDrew += 1;
    if (uncounted.has(file)) continue;
    if (row?.via === OWN_UPLOAD) {
      for (const artist of row.artists ?? []) {
        const list = direct.get(artist) ?? [];
        direct.set(artist, list);
        list.push({ mon: monByFile.get(file)! });
      }
    } else if (row?.via === PACK) add('gen9-resource-pack');
    else if (showdown.has(file)) add('pokemon-showdown');
    // Every other file the app shows, official or fan-made, counts under
    // PokéAPI, the source of most of them (docs/credits/sprite-evidence.json).
    else add('pokeapi-sprites');
  }
  const artists = new Map<string, ArtistCredit>();
  for (const name of [...direct.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }))) {
    artists.set(name, { name, links: artistLinks(name), sprites: direct.get(name)!.sort(dexOrder) });
  }
  return { artists, through, smogonDrew };
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

/** How many of the app's sprite files came through a bundle entry. */
export function projectSpriteCount(entry: string): number {
  return data().through.get(entry) ?? 0;
}

/** How many of the app's sprites the Smogon Sprite Project's artists drew, whatever bundle carried them. */
export function smogonDrewCount(): number {
  return data().smogonDrew;
}
