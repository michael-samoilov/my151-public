import typeIconSelections from '../../scripts/type-icons/selections.json';
import { hasSpriteRows, spriteArtists } from './spriteCredits';

export interface LicenseFile {
  name: string;
  file: string;
}

export interface Acknowledgement {
  id: string;
  name: string;
  by?: string;
  compiledBy?: string;
  usedFor?: string;
  license?: string;
  note?: string;
  links: readonly string[];
  linkLabels?: Readonly<Record<string, string>>;
  texts?: readonly LicenseFile[];
  kind?: 'project' | 'artist' | 'packages';
  rowsOnly?: true;
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

export const artistEntryId = (name: string) => `artist:${name}`;

const typeIconsFrom = (source: string) => {
  const names = Object.entries(typeIconSelections as Record<string, { source: string }>)
    .filter(([, selection]) => selection.source === source)
    .map(([type]) => type[0].toUpperCase() + type.slice(1));
  return `The ${new Intl.ListFormat('en', { type: 'conjunction' }).format(names)} type icons.`;
};

const byCount = <T,>(count: (item: T) => number, name: (item: T) => string) => (a: T, b: T) =>
  count(b) - count(a) || name(a).localeCompare(name(b), 'en', { sensitivity: 'base' });

const SPRITE_SOURCES: readonly Acknowledgement[] = [
  {
    id: 'pokeapi-sprites',
    name: 'PokéAPI sprites',
    usedFor: "The source of most of the app's sprite files.",
    kind: 'project',
    links: ['https://github.com/PokeAPI/sprites', 'https://github.com/PokeAPI/sprites/blob/master/README.md#special-thanks'],
    linkLabels: {
      'https://github.com/PokeAPI/sprites': 'the PokéAPI sprites repository',
      'https://github.com/PokeAPI/sprites/blob/master/README.md#special-thanks': "PokéAPI's credits",
    },
  },
  {
    id: 'pokemon-showdown',
    name: 'Pokémon Showdown',
    usedFor: "The source of some form sprites, such as Unown's letters and the Flabébé family's colors.",
    kind: 'project',
    links: ['https://github.com/smogon/sprites'],
    linkLabels: { 'https://github.com/smogon/sprites': 'the smogon/sprites repository' },
  },
  {
    id: 'gen9-resource-pack',
    name: 'Generation 9 Resource Pack',
    compiledBy: 'Caruban',
    rowsOnly: true,
    usedFor: 'The source of some newer forms and Mega Evolutions, such as the Furfrou trims and Mega Eelektross.',
    license: 'Open collaboration, with credit',
    kind: 'project',
    links: ['https://eeveeexpo.com/resources/1101/'],
  },
  {
    // Its artists drew most of the fan sprites PokéAPI and Showdown carry.
    // Its terms ask to credit the spriter or the project; this credits the
    // project.
    id: 'smogon-sprite-project',
    name: 'Smogon Sprite Project',
    usedFor: 'Its artists drew most of the fan-made sprites that PokéAPI and Showdown carry.',
    license: 'Non-profit use, with credit',
    kind: 'project',
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
];

export const ACKNOWLEDGEMENTS: readonly AcknowledgementGroup[] = [
  {
    id: 'sprite-projects',
    entries: SPRITE_SOURCES.filter((project) => !project.rowsOnly || hasSpriteRows(project.id)),
  },
  {
    id: 'sprite-artists',
    entries: [...spriteArtists()].sort(byCount((artist) => artist.sprites.length, (artist) => artist.name)).map((artist) => ({
      id: artistEntryId(artist.name),
      name: artist.name,
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
        note: 'The type symbols the icons draw are artwork © Nintendo / Game Freak / TPC.',
        links: ['https://github.com/Elginive/pokemon-type-icons'],
      },
      {
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
