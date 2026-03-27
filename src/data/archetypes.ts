import type { Archetype } from '@/types/pokemon';

export const ARCHETYPES: Archetype[] = [
  {
    id: 'early-rodent',
    name: 'Early Route Mammal',
    description: 'Small mammals found on early routes',
    pokemonIds: [19,20, 10091,10092, 161,162, 263,264, 10174,10175, 399,400, 504,505, 659,660, 734,735, 819,820, 915,916],
    suggestedSlotRange: [10, 12],
    color: '#a8a77a',
  },
  {
    id: 'early-bird',
    name: 'Early Route Bird',
    description: 'Flying-type birds found on early routes',
    pokemonIds: [16,17,18, 163,164, 276,277, 396,397,398, 519,520,521, 661,662,663, 731,732,733, 821,822,823, 931],
    suggestedSlotRange: [13, 15],
    color: '#a98ff3',
  },
  {
    id: 'early-bug',
    name: 'Early Bug',
    description: 'Bug-type Pokemon found early in the game',
    pokemonIds: [10,11,12, 13,14,15, 165,166, 167,168, 265,266,267,268,269, 401,402, 540,541,542, 664,665,666, 736,737,738, 824,825,826, 917,918, 919,920],
    suggestedSlotRange: [16, 18],
    color: '#a6b91a',
  },
  {
    id: 'pikachu-clone',
    name: 'Pikachu Clone',
    description: 'Electric rodent mascot Pokemon',
    pokemonIds: [25,26, 10100, 172, 311,312, 417, 587, 702, 777, 877, 921,922,923],
    suggestedSlotRange: [19, 20],
    color: '#f7d02c',
  },
  {
    id: 'early-normal',
    name: 'Early Route Domestic',
    description: 'Domestic/pet-like Pokemon found on early routes',
    pokemonIds: [52,53, 431,432, 509,510, 572,573, 676, 831,832],
    suggestedSlotRange: [21, 25],
    color: '#a8a77a',
  },
  {
    id: 'cave-pokemon',
    name: 'Cave',
    description: 'Pokemon commonly found in caves',
    pokemonIds: [41,42, 50,51, 10105,10106, 74,75,76, 10109,10110,10111, 95, 169,208, 524,525,526, 527,528, 529,530, 557,558, 703, 744,745],
    suggestedSlotRange: [26, 32],
    color: '#b6a136',
  },
  {
    id: 'fishing-pokemon',
    name: 'Fishing',
    description: 'Fish and aquatic creatures you could catch with a fishing rod',
    pokemonIds: [
      116,117,230, // Horsea→Seadra→Kingdra
      118,119,     // Goldeen→Seaking
      129,130,     // Magikarp→Gyarados
      170,171,     // Chinchou→Lanturn
      211,         // Qwilfish
      10234, 904,  // Qwilfish-Hisui→Overqwil
      223,224,     // Remoraid→Octillery
      318,319,     // Carvanha→Sharpedo
      339,340,     // Barboach→Whiscash
      349,350,     // Feebas→Milotic
      369,         // Relicanth
      370,         // Luvdisc
      456,457,     // Finneon→Lumineon
      550, 902,    // Basculin, Basculegion
      690,691,     // Skrelp→Dragalge
      692,693,     // Clauncher→Clawitzer
      746,         // Wishiwashi
      779,         // Bruxish
      846,847,     // Arrokuda→Barraskewda
      976,         // Veluza
      977,         // Dondozo
      978,         // Tatsugiri
    ],
    suggestedSlotRange: [33, 38],
    color: '#6390f0',
  },
  {
    id: 'ocean',
    name: 'Ocean',
    description: 'Marine Pokemon encountered while surfing or diving in open water',
    pokemonIds: [
      72,73,       // Tentacool→Tentacruel
      90,91,       // Shellder→Cloyster
      131,         // Lapras
      222,         // Corsola
      10173,       // Corsola-Galar
      864,         // Cursola
      226,         // Mantine
      458,         // Mantyke
      278,279,     // Wingull→Pelipper
      320,321,     // Wailmer→Wailord
      363,364,365, // Spheal→Sealeo→Walrein
      366,367,368, // Clamperl→Huntail/Gorebyss
      592,593,     // Frillish→Jellicent
      781,         // Dhelmise
      963,964,     // Finizen→Palafin
    ],
    suggestedSlotRange: [33, 42],
    color: '#006494',
  },
  {
    id: 'beach',
    name: 'Beach',
    description: 'Coastal Pokemon found on shorelines, tide pools, and sandy shores',
    pokemonIds: [
      86,87,       // Seel→Dewgong
      98,99,       // Krabby→Kingler
      120,121,     // Staryu→Starmie
      341,342,     // Corphish→Crawdaunt
      422,423,     // Shellos→Gastrodon
      688,689,     // Binacle→Barbaracle
      739,740,     // Crabrawler→Crabominable
      747,748,     // Mareanie→Toxapex
      767,768,     // Wimpod→Golisopod
      769,770,     // Sandygast→Palossand
      771,         // Pyukumuku
      845,         // Cramorant
      871,         // Pincurchin
    ],
    suggestedSlotRange: [33, 42],
    color: '#e9c46a',
  },
  {
    id: 'forest',
    name: 'Forest',
    description: 'Pokemon found in forests, woodlands, and jungles',
    pokemonIds: [
      46,47,       // Paras→Parasect
      102,103,     // Exeggcute→Exeggutor
      10114,       // Exeggutor-Alola
      114,465,     // Tangela→Tangrowth
      127,         // Pinsir
      190,424,     // Aipom→Ambipom
      204,205,     // Pineco→Forretress
      214,         // Heracross
      216,217,     // Teddiursa→Ursaring
      901,         // Ursaluna
      234,         // Stantler
      899,         // Wyrdeer
      273,274,275, // Seedot→Nuzleaf→Shiftry
      285,286,     // Shroomish→Breloom
      287,288,289, // Slakoth→Vigoroth→Slaking
      357,         // Tropius
      420,421,     // Cherubi→Cherrim
      455,         // Carnivine
      585,586,     // Deerling→Sawsbuck
      708,709,     // Phantump→Trevenant
      755,756,     // Morelull→Shiinotic
      765,         // Oranguru
      766,         // Passimian
      775,         // Komala
      840,841,842, // Applin→Flapple/Appletun
      1011,1019,   // Dipplin→Hydrapple
    ],
    suggestedSlotRange: [33, 42],
    color: '#2d6a4f',
  },
  {
    id: 'tundra',
    name: 'Tundra',
    description: 'Ice-dwelling Pokemon found in snowy routes, frozen caves, and arctic areas',
    pokemonIds: [
      124,         // Jynx
      238,         // Smoochum
      215,461,     // Sneasel→Weavile
      10235,903,   // Sneasel-Hisui→Sneasler
      220,221,473, // Swinub→Piloswine→Mamoswine
      225,         // Delibird
      361,362,478, // Snorunt→Glalie/Froslass
      459,460,     // Snover→Abomasnow
      582,583,584, // Vanillite→Vanillish→Vanilluxe
      613,614,     // Cubchoo→Beartic
      615,         // Cryogonal
      712,713,     // Bergmite→Avalugg
      10243,       // Avalugg-Hisui
      872,873,     // Snom→Frosmoth
      875,         // Eiscue
      974,975,     // Cetoddle→Cetitan
    ],
    suggestedSlotRange: [33, 42],
    color: '#7ec8e3',
  },
  {
    id: 'volcanic',
    name: 'Volcanic',
    description: 'Pokemon found near volcanoes, lava fields, and geothermal areas',
    pokemonIds: [
      126,240,467, // Magmar→Magby→Magmortar
      218,219,     // Slugma→Magcargo
      322,323,     // Numel→Camerupt
      324,         // Torkoal
      631,         // Heatmor
      636,637,     // Larvesta→Volcarona
      757,758,     // Salandit→Salazzle
      776,         // Turtonator
      837,838,839, // Rolycoly→Carkol→Coalossal
      850,851,     // Sizzlipede→Centiskorch
    ],
    suggestedSlotRange: [33, 42],
    color: '#d62828',
  },
  {
    id: 'desert',
    name: 'Desert',
    description: 'Pokemon found in deserts, arid ruins, and sandy wastelands',
    pokemonIds: [
      27,28,       // Sandshrew→Sandslash
      328,329,330, // Trapinch→Vibrava→Flygon
      331,332,     // Cacnea→Cacturne
      343,344,     // Baltoy→Claydol
      449,450,     // Hippopotas→Hippowdon
      551,552,553, // Sandile→Krokorok→Krookodile
      554,555,     // Darumaka→Darmanitan
      556,         // Maractus
      561,         // Sigilyph
      562,563,     // Yamask→Cofagrigus
      843,844,     // Silicobra→Sandaconda
      951,952,     // Capsakid→Scovillain
    ],
    suggestedSlotRange: [33, 42],
    color: '#dda15e',
  },
  {
    id: 'elemental-trio',
    name: 'Elemental Trio/Duo',
    description: 'Mid-game groups linked by element or theme',
    pokemonIds: [37,38, 58,59, 77,78, 10103,10104, 10229,10230, 10162,10163, 511,512,513,514,515,516, 133,134,135,136,196,197,470,471,700],
    suggestedSlotRange: [39, 44],
    color: '#ee8130',
  },
  {
    id: 'gift-pokemon',
    name: 'Gift',
    description: 'Pokemon commonly received as gifts in-game',
    pokemonIds: [131, 133,134,135,136, 143, 175,176, 196,197, 447,448, 468, 470,471, 700],
    suggestedSlotRange: [77, 82],
    color: '#d685ad',
  },
  {
    id: 'industrial',
    name: 'Industrial/Artificial',
    description: 'Mechanical, pollution, and artificially-created Pokemon found in urban/industrial areas',
    pokemonIds: [81,82, 88,89, 10112,10113, 100,101, 10231,10232, 109,110, 10167, 137,233,474, 462, 532,533,534, 568,569, 599,600,601, 679,680,681, 707, 884,1018, 957,958,959],
    suggestedSlotRange: [83, 87],
    color: '#b7b7ce',
  },
  {
    id: 'version-exclusive',
    name: 'Version Exclusive Pair',
    description: 'Pokemon that typically appear as version exclusives',
    pokemonIds: [538,539, 546,547,548,549, 564,565,566,567, 627,628,629,630, 765,766, 776,780],
    suggestedSlotRange: [106, 112],
    color: '#737373',
  },
  {
    id: 'trade-evo',
    name: 'Trade Evolution',
    description: 'Pokemon that evolve through trading',
    pokemonIds: [61,64,65, 67,68, 75,76, 10111, 93,94, 95,123,125,126,137,186,208,212,233,356,366,367,368,466,467,474,477,525,526, 10172],
    suggestedSlotRange: [113, 118],
    color: '#737373',
  },
  {
    id: 'mimic',
    name: 'Mimic/Disguise',
    description: 'Pokemon that mimic objects or other Pokemon',
    pokemonIds: [100,101, 10231,10232, 132, 185, 438, 570,571, 10238,10239, 590,591, 778, 854,855],
    suggestedSlotRange: [40, 45],
    color: '#735797',
  },
  {
    id: 'static-encounter',
    name: 'Static Encounter',
    description: 'Pokemon found as overworld/scripted encounters',
    pokemonIds: [
      // RBY/FRLG
      100,101, 131, 143,
      // GSC/HGSS
      130, 185,
      // RSE/ORAS
      351, 352,
      // DPPt
      425, 442, 479,
      // BW/BW2
      518, 555, 571, 590,591, 637, 612,
      // SM/USUM Totem Pokemon
      735, 10092, 746, 758, 754, 738, 778, 784, 752, 10115, 777, 743,
      // Legends Arceus
      77,
      // SV Titans
      950, 962, 968, 977, 978,
    ],
    suggestedSlotRange: [40, 50],
    color: '#f95587',
    // Red Gyarados (Lake of Rage), Shiny Ponyta (PLA), Shiny Haxorus (BW2 Nature Preserve)
    shinyIds: [130, 77, 612],
    // Zen Mode Darmanitan in BW overworld
    spriteOverrides: { 555: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/10017.png' },
    subgroups: [
      { label: 'Red/Blue/Yellow', pokemonIds: [100,101, 131, 143] },
      { label: 'Gold/Silver/Crystal', pokemonIds: [130, 185] },
      { label: 'Ruby/Sapphire/Emerald', pokemonIds: [351, 352] },
      { label: 'Diamond/Pearl/Platinum', pokemonIds: [425, 442, 479] },
      { label: 'Black/White/BW2', pokemonIds: [518, 555, 571, 590,591, 637, 612] },
      { label: 'SM/USUM Totems', pokemonIds: [735, 10092, 746, 758, 754, 738, 778, 784, 752, 10115, 777, 743] },
      { label: 'Legends: Arceus', pokemonIds: [77] },
      { label: 'Scarlet/Violet Titans', pokemonIds: [950, 962, 968, 977, 978] },
    ],
  },
  {
    id: 'evil-team',
    name: 'Evil Team',
    description: 'Pokemon commonly used by villain teams',
    pokemonIds: [
      // Grunts (common across teams)
      19,20, 41,42, 88,89, 109,110, 169, 198, 228,229, 261,262, 430, 434,435, 551,552,553, 559,560, 757,758,
      // Bosses & Lieutenants
      31,34,53,112,  // Giovanni: Nidoqueen, Nidoking, Persian, Rhydon
      319,323,       // Archie(Sharpedo), Maxie(Camerupt)
      432,435,454,   // Mars(Purugly), Jupiter(Skuntank), Saturn(Toxicroak)
      461,430,       // Cyrus: Weavile, Honchkrow
      635,571,601,   // Ghetsis(Hydreigon), N(Zoroark), Colress(Klinklang)
      668,           // Lysandre(Pyroar)
      768,758,       // Guzma(Golisopod), Plumeria(Salazzle)
      760,           // Lusamine(Bewear)
      879,           // Rose(Copperajah)
      936,966,927,979,983,700, // Team Star: Mela(Armarouge), Atticus(Revavroom), Ortega(Dachsbun), Eri(Annihilape), Giacomo(Kingambit), Penny(Sylveon)
    ],
    suggestedSlotRange: [50, 60],
    color: '#705746',
    subgroups: [
      { label: 'Grunts', pokemonIds: [19,20, 41,42, 88,89, 109,110, 169, 198, 228,229, 261,262, 430, 434,435, 551,552,553, 559,560, 757,758] },
      { label: 'Team Rocket (Giovanni)', pokemonIds: [31,34,53,112] },
      { label: 'Team Aqua/Magma (Archie/Maxie)', pokemonIds: [319,323] },
      { label: 'Team Galactic (Cyrus, Mars, Jupiter, Saturn)', pokemonIds: [461,430, 432,435,454] },
      { label: 'Team Plasma (Ghetsis, N, Colress)', pokemonIds: [635,571,601] },
      { label: 'Team Flare (Lysandre)', pokemonIds: [668] },
      { label: 'Team Skull (Guzma, Plumeria)', pokemonIds: [768,758] },
      { label: 'Aether Foundation (Lusamine)', pokemonIds: [760] },
      { label: 'Macro Cosmos (Rose)', pokemonIds: [879] },
      { label: 'Team Star (Mela, Atticus, Ortega, Eri, Giacomo, Penny)', pokemonIds: [936,966,927,979,983,700] },
    ],
  },
  {
    id: 'branched-evo',
    name: 'Branched Evolution',
    description: 'Pokemon with split evolution paths where you choose which form to evolve into',
    pokemonIds: [
      43,44,45,182,       // Oddish→Gloom→Vileplume/Bellossom
      60,61,62,186,       // Poliwag→Poliwhirl→Poliwrath/Politoed
      79,80,199,          // Slowpoke→Slowbro/Slowking
      10164,10165,10172,  // Slowpoke-Galar→Slowbro-Galar/Slowking-Galar
      133,134,135,136,196,197,470,471,700, // Eevee→8 eeveelutions
      236,106,107,237,    // Tyrogue→Hitmonlee/Hitmonchan/Hitmontop
      265,266,267,268,269, // Wurmple→Silcoon→Beautifly / Cascoon→Dustox
      280,281,282,475,    // Ralts→Kirlia→Gardevoir/Gallade
      290,291,292,        // Nincada→Ninjask/Shedinja
      361,362,478,        // Snorunt→Glalie/Froslass
      366,367,368,        // Clamperl→Huntail/Gorebyss
      412,413,414,        // Burmy→Wormadam/Mothim
      123,212,900,        // Scyther→Scizor/Kleavor
      840,841,842,1011,1019, // Applin→Flapple/Appletun/Dipplin→Hydrapple
      935,936,937,        // Charcadet→Armarouge/Ceruledge
    ],
    suggestedSlotRange: [40, 60],
    color: '#e07c4f',
  },
  {
    id: 'rivalry-pair',
    name: 'Rivalry Pair',
    description: 'Thematic opposites that appear together',
    pokemonIds: [106,107, 128,241, 236,237, 311,312, 313,314, 335,336, 337,338, 538,539, 631,632, 734,735,10091,10092, 765,766, 874,875, 10250,10251,10252],
    suggestedSlotRange: [50, 55],
    color: '#c22e28',
  },
  {
    id: 'cross-gen-evo',
    name: 'Cross-Gen Evolution',
    description: 'Pokemon that gained new evolutions or pre-evolutions in later generations',
    pokemonIds: [
      // Gen 2 evos of Gen 1
      169,182,186,196,197,199,208,212,230,233,242,
      // Gen 2 babies of Gen 1
      106,107,172,173,174,236,237,238,239,240,
      // Gen 3 babies of Gen 2
      298,360,
      // Gen 4 evos (forward)
      407,424,429,430,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,
      // Gen 4 babies
      406,433,438,439,440,446,458,
      // Gen 6
      700,
      // Gen 8
      862,863,864,865,866,867, 10164,10165,10172,
      // Gen 8 (Legends Arceus)
      899,900,901,902,903,904,
      // Gen 9
      979,980,981,982,983,1011,1018,1019,
    ],
    suggestedSlotRange: [50, 80],
    color: '#9966cc',
    subgroups: [
      { label: 'Gen 2', pokemonIds: [106,107,169,172,173,174,182,186,196,197,199,208,212,230,233,236,237,238,239,240,242] },
      { label: 'Gen 3', pokemonIds: [298,360] },
      { label: 'Gen 4', pokemonIds: [406,407,424,429,430,433,438,439,440,446,458,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478] },
      { label: 'Gen 6', pokemonIds: [700] },
      { label: 'Gen 8', pokemonIds: [862,863,864,865,866,867, 10164,10165,10172] },
      { label: 'Legends Arceus', pokemonIds: [899,900,901,902,903,904] },
      { label: 'Gen 9', pokemonIds: [979,980,981,982,983,1011,1018,1019] },
    ],
  },
  {
    id: 'gym-champion-ace',
    name: 'Gym/Champion Ace',
    description: 'Signature Pokemon of Gym Leaders, Elite Four & Champions',
    pokemonIds: [
      // Kanto Gym Challenge
      95,121,26,45,110,65,59,112,
      // Kanto Pokemon League
      131,68,94,149,6,
      // Johto Gym Challenge
      17,123,241,94,62,208,221,230,
      // Johto Pokemon League
      178,169,68,229,149,
      // Hoenn Gym Challenge
      299,296,310,324,289,334,337,338,350,
      // Hoenn Pokemon League
      359,356,365,373,376,
      // Sinnoh Gym Challenge
      408,407,448,419,429,411,460,466,
      // Sinnoh Pokemon League
      452,450,392,437,445,
      // Unova Gym Challenge
      505,542,523,530,581,614,612,
      // Unova Pokemon League
      609,625,576,620,637,
      // Kalos Gym Challenge
      666,696,701,673,695,700,678,713,
      // Kalos Pokemon League
      663,689,681,715,282,
      // Alola Island Challenge (Kahunas + Trial Captains)
      740,745,10108,750, 735,752,10115,763,777,770,743,
      // Alola Pokemon League
      733,
      // Galar Gym Challenge
      830,834,851,68,94,869,839,131,862,884,
      // Galar Champion
      6,
      // Paldea Gym Challenge
      216,185,429,740,398,849,671,334,
      // Paldea Pokemon League
      980,959,973,998,970,
    ],
    suggestedSlotRange: [40, 60],
    color: '#f5a623',
    subgroups: [
      { label: 'Kanto Gym Challenge', pokemonIds: [95,121,26,45,110,65,59,112] },
      { label: 'Kanto Pokemon League', pokemonIds: [131,68,94,149,6] },
      { label: 'Johto Gym Challenge', pokemonIds: [17,123,241,94,62,208,221,230] },
      { label: 'Johto Pokemon League', pokemonIds: [178,169,68,229,149] },
      { label: 'Hoenn Gym Challenge', pokemonIds: [299,296,310,324,289,334,337,338,350] },
      { label: 'Hoenn Pokemon League', pokemonIds: [359,356,365,373,376] },
      { label: 'Sinnoh Gym Challenge', pokemonIds: [408,407,448,419,429,411,460,466] },
      { label: 'Sinnoh Pokemon League', pokemonIds: [452,450,392,437,445] },
      { label: 'Unova Gym Challenge', pokemonIds: [505,542,523,530,581,614,612] },
      { label: 'Unova Pokemon League', pokemonIds: [609,625,576,620,637] },
      { label: 'Kalos Gym Challenge', pokemonIds: [666,696,701,673,695,700,678,713] },
      { label: 'Kalos Pokemon League', pokemonIds: [663,689,681,715,282] },
      { label: 'Alola Island Challenge', pokemonIds: [740,745,10108,750, 735,752,10115,763,777,770,743] },
      { label: 'Alola Pokemon League', pokemonIds: [733] },
      { label: 'Galar Gym Challenge', pokemonIds: [830,834,851,68,94,869,839,131,862,884] },
      { label: 'Galar Champion', pokemonIds: [6] },
      { label: 'Paldea Gym Challenge', pokemonIds: [216,185,429,740,398,849,671,334] },
      { label: 'Paldea Pokemon League', pokemonIds: [980,959,973,998,970] },
    ],
  },
];

export function getArchetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find(a => a.id === id);
}

export function getArchetypesForPokemon(pokemonId: number): Archetype[] {
  return ARCHETYPES.filter(a => a.pokemonIds.includes(pokemonId));
}
