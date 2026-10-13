/**
 * Who drew each sprite the app shows, for the footer's Acknowledgements panel.
 *
 * `spriteAttribution.json` holds one row per fan-made sprite file, keyed by
 * the name the file is served under: its artists, what they did (`role`),
 * and the source it came through (`via`). The credits research of 2026-10-13
 * built it by matching each file's pixels with the sources' credit sheets.
 * The panel turns the rows around, so each artist's entry lists every sprite
 * of theirs the app shows (Michael, 2026-10-13), and each project's entry
 * links to the artists it brought and lists the sprites no source names an
 * artist for.
 *
 * A row may carry `roles`, which sets one artist's role when it differs from
 * the row's: an animation is `drew` for its animator and `base` for the
 * artist of the sprite under it. The other fields (`evidence`, `cleanup`,
 * `todo`, and more) are notes for maintainers; the build keeps only what the
 * panel reads (see `scripts/acknowledgements-build.ts`).
 *
 * `scripts/check-sprite-revisions.mjs` fails when a sprite file is added or
 * replaced without a row, or when a row names a missing file.
 */
import attribution from './spriteAttribution.json';
import { allPickerMons, comparePickerOrder, type PickerMon } from '@/favorites/model/catalog';

export type SpriteRole = 'drew' | 'edited' | 'base';
const ROLES: readonly SpriteRole[] = ['drew', 'edited', 'base'];

/** A sprite its artist posted, rather than one that came through a project. */
export const OWN_UPLOAD = 'own upload';
/** Sources that credit no one: Game Freak's own sprites, and my151's own drawings. */
const UNCREDITED = new Set(['game-freak', 'my151']);

/**
 * The panel entry each `via` belongs to. The research keeps Smogon's four
 * credit sheets apart; the panel credits the one project they belong to.
 * A `via` missing here fails the panel's first open, so a new source gets an
 * entry before it ships.
 */
const VIA_ENTRY: Readonly<Record<string, string>> = {
  'smogon-gen6': 'smogon-sprite-project',
  'smogon-gen7': 'smogon-sprite-project',
  'smogon-gen8': 'smogon-sprite-project',
  'smogon-gen9': 'smogon-sprite-project',
  pokeapi: 'pokeapi-sprites',
  'gen9-resource-pack': 'gen9-resource-pack',
  // Ghasty001's own repository.
  ghasty001: OWN_UPLOAD,
  [OWN_UPLOAD]: OWN_UPLOAD,
};

interface AttributionRow {
  artists: string[];
  role: SpriteRole;
  roles?: Record<string, SpriteRole>;
  via: string;
}
interface AttributionFile {
  sprites: Record<string, AttributionRow>;
  artists: Record<string, { links?: string[] }>;
  projects: Record<string, { artists?: string[] }>;
}

const DATA = attribution as unknown as AttributionFile;

/** One sprite in an artist's or a project's entry. */
export interface CreditedSprite {
  mon: PickerMon;
  role: SpriteRole;
  /** The panel entry of the project it came through, or `OWN_UPLOAD`. */
  via: string;
  /** The sprite's other artists, each with their own role. */
  with: readonly { name: string; role: SpriteRole }[];
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
  /** How many of the app's sprites came through each project entry. */
  projectSprites: Map<string, number>;
  /** Each project's sprites that no source names an artist for. */
  projectOnly: Map<string, CreditedSprite[]>;
}

/** Reads every row once, and fails on a row that names a role or source nobody defined. */
function parse(): Parsed {
  const monByFile = new Map(allPickerMons().map((mon) => [spriteFile(mon.sprite), mon] as const));
  const credits = new Map<string, CreditedSprite[]>();
  const projectSprites = new Map<string, number>();
  const projectOnly = new Map<string, CreditedSprite[]>();
  for (const [file, row] of Object.entries(DATA.sprites)) {
    if (UNCREDITED.has(row.via)) continue;
    const via = VIA_ENTRY[row.via];
    if (!via) throw new Error(`spriteAttribution.json: ${file} names a source with no panel entry, "${row.via}". Add it to VIA_ENTRY.`);
    const mon = monByFile.get(file);
    // A file the app does not show is nobody's credit here.
    if (!mon) continue;
    if (via !== OWN_UPLOAD) projectSprites.set(via, (projectSprites.get(via) ?? 0) + 1);
    if (!row.artists.length) {
      const list = projectOnly.get(via) ?? [];
      projectOnly.set(via, list);
      list.push({ mon, role: row.role, via, with: [] });
    }
    for (const artist of row.artists) {
      const role = row.roles?.[artist] ?? row.role;
      if (!ROLES.includes(role)) throw new Error(`spriteAttribution.json: ${file} gives ${artist} an unknown role, "${role}".`);
      const others = row.artists.filter((other) => other !== artist);
      const list = credits.get(artist) ?? [];
      credits.set(artist, list);
      list.push({ mon, role, via, with: others.map((name) => ({ name, role: row.roles?.[name] ?? row.role })) });
    }
  }
  const artists = new Map<string, ArtistCredit>();
  const names = [...credits.keys()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  for (const name of names) {
    artists.set(name, { name, links: DATA.artists[name]?.links ?? [], sprites: credits.get(name)!.sort(dexOrder) });
  }
  for (const list of projectOnly.values()) list.sort(dexOrder);
  return { artists, projectSprites, projectOnly };
}

let parsed: Parsed | undefined;
const data = () => (parsed ??= parse());

/** Every artist with a sprite in the app, by name. */
export function spriteArtists(): readonly ArtistCredit[] {
  return [...data().artists.values()];
}

export function artistCredit(name: string): ArtistCredit | undefined {
  return data().artists.get(name);
}

/** How many of the app's sprites came through a project entry. */
export function projectSpriteCount(entry: string): number {
  return data().projectSprites.get(entry) ?? 0;
}

/** A project's sprites that no source names an artist for, credited to the project alone. */
export function projectOnlySprites(entry: string): readonly CreditedSprite[] {
  return data().projectOnly.get(entry) ?? [];
}

/**
 * The artists a project brought: those with sprites in the app that came
 * through it, each with how many, and then the other artists its credit
 * sheets name, who have no sprite that came that way.
 */
export function projectArtists(entry: string): { credited: { artist: ArtistCredit; count: number }[]; others: string[] } {
  const credited = spriteArtists()
    .map((artist) => ({ artist, count: artist.sprites.filter((sprite) => sprite.via === entry).length }))
    .filter(({ count }) => count > 0)
    // Most sprites first, as the panel's list of artists is.
    .sort((a, b) => b.count - a.count || a.artist.name.localeCompare(b.artist.name, 'en', { sensitivity: 'base' }));
  const named = new Set(credited.map(({ artist }) => artist.name));
  const listed = Object.entries(DATA.projects)
    .filter(([via]) => VIA_ENTRY[via] === entry)
    .flatMap(([, project]) => project.artists ?? []);
  const others = [...new Set(listed)].filter((name) => !named.has(name)).sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
  return { credited, others };
}
