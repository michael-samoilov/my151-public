/**
 * The people and projects the footer's Acknowledgements panel credits.
 *
 * Entry content stays in English in every locale: the names are proper nouns,
 * and the credit lines and license texts are the sources' own words. Only the
 * panel's chrome goes through the i18n catalogs.
 *
 * License texts live in `public/licenses/` and load when an entry opens, so
 * none of them reach a page's first download.
 */

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
  /** What my151 uses it for. */
  usedFor: string;
  /** Short license or terms label for the row's second line. Absent when the source states none. */
  license?: string;
  /** The source's own terms or credit statement, in full. */
  terms?: string;
  artists?: readonly string[];
  links: readonly string[];
  texts?: readonly LicenseFile[];
}

export type AcknowledgementGroupId = 'sprites' | 'icons' | 'fonts' | 'data' | 'code';

export interface AcknowledgementGroup {
  id: AcknowledgementGroupId;
  entries: readonly Acknowledgement[];
}

const SMOGON_SPRITERS = [
  'leParagon', 'Blaquaza', 'TheAetherPlayer', 'G.E.Z.', 'KingOfThe-X-Roads', 'Spook', 'Cynda',
  'Involuntary Twitch', 'mjco', 'Z-nogyroP', 'PumpkinPastel', 'RadicalCharizard', 'HM100', 'N-Kin',
  'Zerudez', 'MyMarshlands', 'Wobblebuns', 'princessofmusic', 'aXl', 'fishbowlsoul90', 'HealnDeal',
  'Espeon Scientist', 'AMVictory', 'Mega-Pokebattlerz', 'Layell', 'GeoisEvil', 'Quanyails', 'RedRooster',
  'Wyverii', 'Basic Vanillite', 'Larryturbo', 'TheCynicalPoet', 'Arkeis', 'paintseagull', 'Branflakes325',
  'Siiilver', 'Noscium', 'Sleet', 'Zermonious', 'Bynine', 'Corson', 'Legitimate Username', 'TrainerSplash',
  'Farriella', 'MrDollSteak', 'TeraVolt', 'Dleep', 'WPS', 'Brylark', 'KattenK', 'Travis', 'SpheX',
  'SelenaArmorclaw', 'Hematite',
] as const;

export const ACKNOWLEDGEMENTS: readonly AcknowledgementGroup[] = [
  {
    id: 'sprites',
    entries: [
      {
        id: 'smogon-sprite-project',
        name: 'Smogon Sprite Project',
        usedFor:
          'Black and White-style sprites for Pokémon #650 and up and for many forms, served through PokéAPI and Pokémon Showdown.',
        license: 'Non-profit use, with credit',
        terms: 'Free for non-profit use with credit to the spriter or the project.',
        artists: SMOGON_SPRITERS,
        links: ['https://www.smogon.com/forums/threads/smogon-sprite-project.3647722/'],
      },
      {
        id: 'kingofthe-x-roads',
        name: 'KingOfThe-X-Roads',
        usedFor: 'Generation 9 sprites.',
        license: 'Non-profit use, with credit',
        terms: 'Free for non-profit projects, with credit.',
        links: ['https://www.deviantart.com/kingofthe-x-roads/gallery'],
      },
      {
        id: 'kyle-dove',
        name: 'Kyle Dove',
        usedFor: 'Legends: Z-A Mega sprites.',
        links: ['https://x.com/DoveKyle'],
      },
      {
        id: 'gen9-resource-pack',
        name: 'Generation 9 Resource Pack',
        by: 'Caruban and contributors',
        usedFor: 'Mega Dragalge, Mega Raichu Y and Mega Heatran.',
        license: 'Free to use, with credit',
        terms: 'Free to use with credit to the creator.',
        artists: ['Caruban', 'ace_stryfe', 'KingOfThe-X-Roads', 'camiloveso', 'Mak'],
        links: ['https://github.com/Teffa14/AutoPTU/tree/main/Generation%209%20Pack%20v3.3.4'],
      },
      {
        id: 'ghasty001',
        name: 'Ghasty001',
        usedFor: 'Mega Eelektross, from a base sprite by kiriaura.',
        license: 'Free to use, with credit',
        terms: 'Free to use with credit.',
        links: ['https://github.com/Ghasty001/Animated_sprites_by_Ghasty001'],
      },
      {
        id: 'pokeapi-sprites',
        name: 'PokéAPI sprites',
        usedFor: "Serves the app's Pokémon sprites.",
        links: ['https://github.com/PokeAPI/sprites'],
      },
      {
        id: 'pokemon-showdown',
        name: 'Pokémon Showdown',
        usedFor: "Serves some form sprites, such as Vivillon's patterns.",
        links: ['https://pokemonshowdown.com'],
      },
    ],
  },
  {
    id: 'icons',
    entries: [
      {
        id: 'partywhale-type-icons',
        name: 'Pokémon type icons',
        by: 'Partywhale (James Watkins)',
        usedFor: 'The Fighting, Rock, Bug, Water and Psychic type icons.',
        license: 'MIT',
        texts: [{ name: 'MIT', file: 'partywhale-pokemon-type-icons-MIT.txt' }],
        links: ['https://github.com/partywhale/pokemon-type-icons'],
      },
      {
        id: 'elginive-type-icons',
        name: 'Generation 9 type icons',
        by: 'Elginive',
        usedFor: 'The other 13 type icons.',
        license: 'Free to use',
        terms: 'Free to use.',
        links: ['https://github.com/Elginive/pokemon-type-icons'],
      },
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
      {
        id: 'bulbagarden-archives',
        name: 'Bulbagarden Archives',
        usedFor:
          'Move category icons, the Mega Evolution and Dynamax symbols, the Blue and Red Orbs, the Leaf Crown and the Shiny Leaf.',
        license: 'Artwork © Nintendo / Game Freak / TPC',
        terms: 'The artwork belongs to Nintendo, Game Freak and The Pokémon Company; Bulbagarden hosts it.',
        links: ['https://archives.bulbagarden.net'],
      },
      {
        id: 'steamgriddb',
        name: 'SteamGridDB',
        usedFor: "Arceus's ring, traced for the favorite picker's Legendary icon.",
        links: ['https://www.steamgriddb.com'],
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
        by: 'Google',
        usedFor: 'The Roman numerals on the generation discs.',
        license: 'SIL OFL 1.1',
        texts: [{ name: 'SIL OFL 1.1', file: 'noto-sans-OFL-1.1.txt' }],
        links: ['https://fonts.google.com/noto/specimen/Noto+Sans'],
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
        usedFor: 'Game text in nine languages.',
        license: 'GPL-3.0 (repository)',
        terms: 'The repository is GPL 3.0; the text belongs to Nintendo, Game Freak and The Pokémon Company.',
        texts: [{ name: 'GPL-3.0', file: 'poke-corpus-GPL-3.0.txt' }],
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
        id: 'hover-tilt',
        name: 'hover-tilt',
        by: 'Simon Goellner',
        usedFor: 'The pointer tilt of the export card.',
        license: 'MIT (repository) · MPL-2.0 (package)',
        texts: [
          { name: 'MIT (repository)', file: 'hover-tilt-MIT.txt' },
          { name: 'MPL-2.0 (package)', file: 'hover-tilt-MPL-2.0.txt' },
        ],
        links: ['https://github.com/simeydotme/hover-tilt'],
      },
    ],
  },
];
