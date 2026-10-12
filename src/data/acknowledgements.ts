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
  /** A link's button text, for an entry whose links share one site. Otherwise the button names the site. */
  linkLabels?: Readonly<Record<string, string>>;
  texts?: readonly LicenseFile[];
}

export type AcknowledgementGroupId = 'sprites' | 'icons' | 'fonts' | 'data' | 'code';

/** The entries whose detail lists the sprites they drew, from `spriteCredits.ts`. */
export const SPRITE_CREDIT_IDS = [
  'smogon-sprite-project',
  'kingofthe-x-roads',
  'kyle-dove',
  'gen9-resource-pack',
  'ghasty001',
] as const;
export type SpriteCreditId = (typeof SPRITE_CREDIT_IDS)[number];

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
          'Black and White-style sprites for every Pokémon in Generations 6 to 8, Chespin (#650) to Enamorus (#905), and for many forms, such as Megas, regional forms and Gigantamax forms. The app takes them from PokéAPI and Pokémon Showdown.',
        license: 'Non-profit use, with credit',
        terms:
          'Read on the project threads on 2026-10-12: “These sprites are also free for use as long as the spriter or the project itself is credited.” and “For the sake of transparency, these sprites are free for non-profit use.”',
        artists: SMOGON_SPRITERS,
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
        id: 'kingofthe-x-roads',
        name: 'KingOfThe-X-Roads',
        usedFor: 'Generation 9 sprites.',
        license: 'Non-profit use, with credit',
        terms:
          "From the artist's About page: “Any official Pokémon sprites are free for use in non-profit projects. EXCEPT FOR ANY PERSONS AFFILIATED WITH VERLISWOLF. All I ask is that you provide proper credit, maybe even drop some links around!”",
        links: ['https://www.deviantart.com/kingofthe-x-roads/gallery'],
      },
      {
        id: 'kyle-dove',
        name: 'Kyle Dove',
        usedFor: 'Legends: Z-A Mega sprites.',
        license: 'Free to use, with credit',
        terms:
          "PokéAPI's README thanks “x.com/DoveKyle/github.com/kyledovey for providing the back_default, back_shiny and z-a mega sprites for generation 9”. His terms, quoted from one of his X posts, not read at the source: “Free to use with credits! Victreebel (front & back) please credit my friend MyMarshlands - I do not follow size nor color limits, feel free to resize/edit as needed!”",
        links: ['https://x.com/DoveKyle', 'https://github.com/kyledovey'],
      },
      {
        id: 'gen9-resource-pack',
        name: 'Generation 9 Resource Pack',
        by: 'Caruban and contributors',
        usedFor: 'Mega Dragalge, Mega Raichu Y and Mega Heatran.',
        license: 'Free to use, with credit',
        terms: 'Reported, not read at the source: free to use with credit to the creator.',
        artists: ['Caruban', 'ace_stryfe', 'KingOfThe-X-Roads', 'camiloveso', 'Mak'],
        links: ['https://github.com/Teffa14/AutoPTU/tree/main/Generation%209%20Pack%20v3.3.4'],
      },
      {
        id: 'ghasty001',
        name: 'Ghasty001',
        usedFor: 'Mega Eelektross, from a base sprite by kiriaura.',
        license: 'Free to use, with credit',
        terms:
          "From the repository's README: “All these sprites are free to use, for other projects to use *with credit*. The credits also apply to all the artists who made the base sprite I used for the animation (also shared with free to use consent), and all of them will be listed below.”",
        links: ['https://github.com/Ghasty001/Animated_sprites_by_Ghasty001'],
      },
      {
        id: 'pokeapi-sprites',
        name: 'PokéAPI sprites',
        usedFor: "The source of the app's Pokémon sprite files. my151 hosts its own copies.",
        links: ['https://github.com/PokeAPI/sprites'],
      },
      {
        id: 'pokemon-showdown',
        name: 'Pokémon Showdown',
        usedFor: "The source of some form sprite files, such as Vivillon's patterns. my151 hosts its own copies.",
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
        terms: "From the repository's README: “Free to use. Credit is always appreciated, but not necessary.”",
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
        terms: "The game text belongs to Nintendo, Game Freak and The Pokémon Company. poke-corpus's own code is under GPL 3.0; my151 does not use it.",
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
        name: 'Open-source packages',
        usedFor:
          "The npm packages the site is built with, such as React, Radix UI, d3 and ECharts. Each package's license notice is in the files below.",
        license: 'MIT, ISC, Apache-2.0 and others',
        // The build writes npm-packages.txt (vite.config.ts, build.license);
        // npm-packages-extra.txt holds the notices it misses.
        links: ['/licenses/npm-packages.txt', '/licenses/npm-packages-extra.txt'],
        linkLabels: {
          '/licenses/npm-packages.txt': 'package licenses',
          '/licenses/npm-packages-extra.txt': 'more package licenses',
        },
      },
      {
        id: 'hover-tilt',
        name: 'hover-tilt',
        by: 'Simon Goellner',
        usedFor: 'The tilt, springs, drop shadow, and glare of the export card.',
        license: 'MIT (repository) · MPL-2.0 (package)',
        // MPL-2.0 section 3.2(a): say where the source of the changed files is.
        terms: "my151's changed hover-tilt files are available as source at the links above.",
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
