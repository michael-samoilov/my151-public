/**
 * The people and projects the footer's Acknowledgements panel credits.
 *
 * Entry content stays in English in every locale: the names are proper nouns,
 * and the credit lines and license texts are the sources' own words. Only the
 * panel's chrome goes through the i18n catalogs.
 *
 * License texts live in `public/licenses/` and load when an entry opens, so
 * none of them reach a page's first download.
 *
 * Lists and terms come from data, not from this file: each sprite artist's
 * entry and sprites from `spriteAttribution.json` (see `spriteCredits.ts`),
 * every quoted term from `creditTerms.json` (see `creditTerms.ts`), the type
 * icons each source drew from the icon build's `selections.json`, and the npm
 * packages from the build's own license list.
 */
import typeIconSelections from '../../scripts/type-icons/selections.json';
import { projectSpriteCount, spriteArtists } from './spriteCredits';

/** A license or terms file under `public/licenses/`. */
export interface LicenseFile {
  /** Heading above the text when an entry ships more than one file. */
  name: string;
  /** File name under `public/licenses/`. */
  file: string;
}

export interface Acknowledgement {
  /** Stable id: the React key and the test hook. */
  id: string;
  name: string;
  /** The author, when the credit names one. Shown as "by …". */
  by?: string;
  /** Who compiled a collection whose parts others drew. Shown as "compiled by …". */
  compiledBy?: string;
  /** An artist's older spellings, as the sources credit them. Shown as "Credited as …". */
  creditedAs?: readonly string[];
  /** What my151 uses it for. An artist's entry builds its own from the sprite rows. */
  usedFor?: string;
  /** Short license or terms label for the row's second line. Absent when the source states none. */
  license?: string;
  /**
   * my151's own words about the license, such as where to find the source of
   * changed files. A source's terms are never written here: the panel quotes
   * them from `creditTerms.json`, by the entry's id.
   */
  note?: string;
  links: readonly string[];
  /** A link's button text, for an entry whose links share one site. Otherwise the button names the site. */
  linkLabels?: Readonly<Record<string, string>>;
  texts?: readonly LicenseFile[];
  /**
   * What the detail shows below "Used for": a sprite project's artists, an
   * artist's sprites, or the npm packages in the build.
   */
  kind?: 'project' | 'artist' | 'packages';
  /** A project whose sprites reach the app only as rows shows only while one of them does. */
  rowsOnly?: true;
  /**
   * How a project's count reads: "my151 shows N sprites from it", or, for a
   * host whose own credits name the artists of only some files, "N sprites
   * are credited to their artists through its credits".
   */
  countLine?: 'credited';
}

export type AcknowledgementGroupId =
  | 'sprite-projects'
  | 'sprite-artists'
  | 'pokemon-art'
  | 'interface-icons'
  | 'fonts'
  | 'data'
  | 'code';

export interface AcknowledgementGroup {
  id: AcknowledgementGroupId;
  entries: readonly Acknowledgement[];
}

/** An artist's entry id. */
export const artistEntryId = (name: string) => `artist:${name}`;

/** The type icons one source drew, in the games' type order, from the icon build's own selection. */
const typeIconsFrom = (source: string) => {
  const names = Object.entries(typeIconSelections as Record<string, { source: string }>)
    .filter(([, selection]) => selection.source === source)
    .map(([type]) => type[0].toUpperCase() + type.slice(1));
  return `The ${new Intl.ListFormat('en', { type: 'conjunction' }).format(names)} type icons.`;
};

/** Most sprites first (Michael, 2026-10-13); a tie goes by name. */
const byCount = <T,>(count: (item: T) => number, name: (item: T) => string) => (a: T, b: T) =>
  count(b) - count(a) || name(a).localeCompare(name(b), 'en', { sensitivity: 'base' });

const SPRITE_PROJECTS: readonly Acknowledgement[] = [
  {
    id: 'smogon-sprite-project',
    name: 'Smogon Sprite Project',
    usedFor:
      "Black and White-style sprites that the project's artists draw for the Pokémon and forms that came after Generation 5. The app takes most of these files from PokéAPI and some from Pokémon Showdown; Radiant Sun Solgaleo, Full Moon Lunala and Zenith Marshadow come from the Generation 9 Resource Pack.",
    license: 'Non-profit use, with credit',
    kind: 'project',
    // The X and Y thread asks for a credit page that links back to it.
    links: [
      'https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/',
      'https://www.smogon.com/forums/threads/sun-moon-sprite-project.3577711/',
      'https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/',
    ],
    linkLabels: {
      'https://www.smogon.com/forums/threads/x-y-sprite-project.3486712/': 'Generation 6 thread',
      'https://www.smogon.com/forums/threads/sun-moon-sprite-project.3577711/': 'Generation 7 thread',
      'https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/': 'Generation 8 and later thread',
    },
  },
  {
    id: 'gen9-resource-pack',
    name: 'Generation 9 Resource Pack',
    // Caruban compiled the pack; its sheet credits none of the sprites my151
    // takes from it to Caruban (credits research, 2026-10-13).
    compiledBy: 'Caruban',
    rowsOnly: true,
    usedFor: 'Sprites that replace single PokéAPI sprites or fill its gaps.',
    license: 'Open collaboration, with credit',
    kind: 'project',
    links: ['https://eeveeexpo.com/resources/1101/'],
  },
  {
    id: 'pokeapi-sprites',
    name: 'PokéAPI sprites',
    usedFor:
      "The source of most of the app's sprite files; my151 hosts its own copies. Most of them were drawn for the Smogon Sprite Project, which credits their artists.",
    kind: 'project',
    countLine: 'credited',
    links: ['https://github.com/PokeAPI/sprites'],
  },
  {
    id: 'pokemon-showdown',
    name: 'Pokémon Showdown',
    usedFor: "Its Gen 5 sprite folder is the source of the form sprites below, which PokéAPI lacks. my151 hosts its own copies.",
    kind: 'project',
    links: ['https://pokemonshowdown.com'],
  },
];

export const ACKNOWLEDGEMENTS: readonly AcknowledgementGroup[] = [
  {
    id: 'sprite-projects',
    entries: SPRITE_PROJECTS
      .filter((project) => !project.rowsOnly || projectSpriteCount(project.id) > 0)
      .sort(byCount((project) => projectSpriteCount(project.id), (project) => project.name)),
  },
  {
    id: 'sprite-artists',
    // Counted from the same list the artist's Used for shows, so the order
    // and the entry cannot disagree.
    entries: [...spriteArtists()].sort(byCount((artist) => artist.sprites.length, (artist) => artist.name)).map((artist) => ({
      id: artistEntryId(artist.name),
      name: artist.name,
      creditedAs: artist.creditedAs,
      links: artist.links,
      kind: 'artist',
    })),
  },
  {
    id: 'pokemon-art',
    entries: [
      {
        id: 'partywhale-type-icons',
        name: 'Pokémon type icons',
        by: 'Partywhale (James Watkins)',
        usedFor: typeIconsFrom('partywhale'),
        license: 'MIT',
        texts: [{ name: 'MIT', file: 'partywhale-pokemon-type-icons-MIT.txt' }],
        note: 'The type symbols the icons draw are artwork © Nintendo / Game Freak / TPC.',
        links: ['https://github.com/partywhale/pokemon-type-icons'],
      },
      {
        id: 'elginive-type-icons',
        name: 'Generation 9 type icons',
        by: 'Elginive',
        usedFor: typeIconsFrom('elginive'),
        license: 'Free to use',
        // The README says the icons recreate the games' own type icons.
        note: 'The type symbols the icons draw are artwork © Nintendo / Game Freak / TPC.',
        links: ['https://github.com/Elginive/pokemon-type-icons'],
      },
      {
        // ShapeIcon.tsx: the 14 silhouettes of the games' shape search. Git
        // history does not say which site the files came from.
        id: 'pokemon-home-shapes',
        name: 'Pokémon HOME body-shape icons',
        usedFor: "The body-shape icons the app shows for a Pokémon's shape, from Pokémon HOME.",
        license: 'Artwork © Nintendo / Game Freak / TPC',
        note: 'The artwork belongs to Nintendo, Game Freak and The Pokémon Company.',
        links: [],
      },
      {
        id: 'bulbagarden-archives',
        name: 'Bulbagarden Archives',
        usedFor:
          'Move category icons, the Mega Evolution and Dynamax symbols, the Blue and Red Orbs, the Leaf Crown and the Shiny Leaf.',
        license: 'Artwork © Nintendo / Game Freak / TPC',
        note: 'The artwork belongs to Nintendo, Game Freak and The Pokémon Company; Bulbagarden hosts it.',
        links: ['https://archives.bulbagarden.net'],
      },
    ],
  },
  {
    id: 'interface-icons',
    entries: [
      {
        id: 'lucide',
        name: 'Lucide',
        usedFor: 'Interface icons.',
        license: 'ISC',
        texts: [{ name: 'ISC', file: 'lucide-ISC.txt' }],
        links: ['https://lucide.dev'],
      },
      {
        id: 'tabler-icons',
        name: 'Tabler Icons',
        by: 'Paweł Kuna',
        usedFor: 'The laurel wreath icons.',
        license: 'MIT',
        texts: [{ name: 'MIT', file: 'tabler-icons-MIT.txt' }],
        links: ['https://github.com/tabler/tabler-icons'],
      },
      {
        id: 'simple-icons',
        name: 'Simple Icons',
        usedFor: 'The social logos in the league export survey, through react-icons.',
        license: 'CC0 1.0 · MIT (react-icons)',
        texts: [
          { name: 'Simple Icons: CC0 1.0', file: 'simple-icons-CC0-1.0.txt' },
          { name: 'react-icons: MIT', file: 'react-icons-MIT.txt' },
        ],
        links: ['https://simpleicons.org', 'https://github.com/react-icons/react-icons'],
      },
    ],
  },
  {
    id: 'fonts',
    entries: [
      {
        id: 'inter',
        name: 'Inter',
        by: 'Rasmus Andersson',
        usedFor: "The app's typeface.",
        license: 'SIL OFL 1.1',
        texts: [{ name: 'SIL OFL 1.1', file: 'inter-OFL-1.1.txt' }],
        links: ['https://rsms.me/inter/'],
      },
      {
        id: 'noto-sans',
        name: 'Noto Sans',
        by: 'Google LLC',
        usedFor: 'The Roman numerals on the generation discs.',
        license: 'SIL OFL 1.1',
        texts: [{ name: 'SIL OFL 1.1', file: 'noto-sans-OFL-1.1.txt' }],
        links: ['https://fonts.google.com/noto/specimen/Noto+Sans'],
      },
      {
        id: 'press-start-2p',
        name: 'Press Start 2P',
        by: 'CodeMan38',
        usedFor: "The 404 page's lettering. my151 ships a subset renamed Pixel151, as the license asks of a modified version.",
        license: 'SIL OFL 1.1',
        texts: [{ name: 'SIL OFL 1.1', file: 'press-start-2p-OFL.txt' }],
        links: ['https://fonts.google.com/specimen/Press+Start+2P'],
      },
    ],
  },
  {
    id: 'data',
    entries: [
      {
        id: 'pokeapi',
        name: 'PokéAPI',
        by: 'Paul Hallett and the PokéAPI contributors',
        usedFor: 'Stats, types, evolutions, forms and names.',
        license: 'BSD 3-Clause',
        texts: [{ name: 'BSD 3-Clause', file: 'pokeapi-BSD-3-Clause.txt' }],
        links: ['https://pokeapi.co', 'https://github.com/PokeAPI/pokeapi'],
      },
      {
        id: 'poke-corpus',
        name: 'poke-corpus',
        by: 'abcboy101',
        usedFor:
          "Game text in nine languages, such as type, move and form names, read from the project's text dumps of the games. my151 uses none of its code.",
        license: 'Game text © Nintendo / Game Freak / TPC',
        note: "The game text belongs to Nintendo, Game Freak and The Pokémon Company. poke-corpus's own code is under GPL 3.0; my151 does not use it.",
        links: ['https://github.com/abcboy101/poke-corpus'],
      },
      {
        // Data, not art: the app reads which body shape each alternate form
        // has from Bulbapedia's text, and shows no image from it.
        id: 'bulbapedia',
        name: 'Bulbapedia',
        usedFor: 'The body shapes of alternate forms.',
        links: ['https://bulbapedia.bulbagarden.net'],
      },
    ],
  },
  {
    id: 'code',
    entries: [
      {
        id: 'npm-packages',
        name: 'npm packages',
        usedFor: "The open-source libraries in the site's code. Each one is listed below with its version, by license.",
        kind: 'packages',
        // vite.config.ts writes both lists into the build: npm-packages.txt
        // (build.license) and npm-packages.json, which the panel reads.
        // npm-packages-extra.txt holds the notices Vite's list misses.
        links: [],
      },
      {
        id: 'hover-tilt',
        name: 'hover-tilt',
        by: 'Simon Goellner',
        usedFor: 'The tilt, springs, drop shadow, and glare of the export card.',
        license: 'MIT (repository) · MPL-2.0 (package)',
        // MPL-2.0 section 3.2(a): say where the source of the changed files is.
        note: "my151's changed hover-tilt files are available as source at the links above.",
        texts: [
          { name: 'MIT (repository)', file: 'hover-tilt-MIT.txt' },
          { name: 'MPL-2.0 (package)', file: 'hover-tilt-MPL-2.0.txt' },
        ],
        links: [
          'https://github.com/simeydotme/hover-tilt',
          '/licenses/source/hover-tilt/hoverTilt.ts.txt',
          '/licenses/source/hover-tilt/hoverTilt.css.txt',
        ],
        linkLabels: {
          '/licenses/source/hover-tilt/hoverTilt.ts.txt': 'hoverTilt.ts source',
          '/licenses/source/hover-tilt/hoverTilt.css.txt': 'hoverTilt.css source',
        },
      },
    ],
  },
];
