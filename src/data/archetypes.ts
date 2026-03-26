import type { Archetype } from '@/types/pokemon';

export const ARCHETYPES: Archetype[] = [
  {
    id: 'grass-starter',
    name: 'Grass Starter',
    description: 'Grass-type starter evolution lines',
    pokemonIds: [1,2,3, 152,153,154, 252,253,254, 387,388,389, 495,496,497, 650,651,652, 722,723,724, 810,811,812, 906,907,908],
    suggestedSlotRange: [1, 3],
    color: '#7ac74c',
  },
  {
    id: 'fire-starter',
    name: 'Fire Starter',
    description: 'Fire-type starter evolution lines',
    pokemonIds: [4,5,6, 155,156,157, 255,256,257, 390,391,392, 498,499,500, 653,654,655, 725,726,727, 813,814,815, 909,910,911],
    suggestedSlotRange: [4, 6],
    color: '#ee8130',
  },
  {
    id: 'water-starter',
    name: 'Water Starter',
    description: 'Water-type starter evolution lines',
    pokemonIds: [7,8,9, 158,159,160, 258,259,260, 393,394,395, 501,502,503, 656,657,658, 728,729,730, 816,817,818, 912,913,914],
    suggestedSlotRange: [7, 9],
    color: '#6390f0',
  },
  {
    id: 'early-rodent',
    name: 'Early Route Rodent',
    description: 'Normal-type rodents/mammals found on early routes',
    pokemonIds: [19,20, 161,162, 263,264, 399,400, 504,505, 659,660, 734,735, 819,820, 915,916],
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
    pokemonIds: [25,26, 172, 311,312, 417, 587, 702, 777, 877, 921,922,923],
    suggestedSlotRange: [19, 20],
    color: '#f7d02c',
  },
  {
    id: 'early-normal',
    name: 'Early Route Normal',
    description: 'Normal-type Pokemon commonly found in early areas',
    pokemonIds: [52,53, 431,432, 509,510, 572,573, 676, 831,832],
    suggestedSlotRange: [21, 25],
    color: '#a8a77a',
  },
  {
    id: 'cave-pokemon',
    name: 'Cave Pokemon',
    description: 'Pokemon commonly found in caves',
    pokemonIds: [41,42, 74,75,76, 95, 169,208, 524,525,526, 527,528, 529,530, 557,558, 703, 744,745],
    suggestedSlotRange: [26, 32],
    color: '#b6a136',
  },
  {
    id: 'fishing-pokemon',
    name: 'Fishing/Water Route',
    description: 'Common water Pokemon found by fishing or surfing',
    pokemonIds: [118,119, 129,130, 170,171, 223,224, 320,321, 349,350, 369, 550, 594, 746, 771],
    suggestedSlotRange: [33, 38],
    color: '#6390f0',
  },
  {
    id: 'elemental-trio',
    name: 'Elemental Trio/Duo',
    description: 'Mid-game groups linked by element or theme',
    pokemonIds: [37,38, 58,59, 77,78, 133,134,135,136,196,197,470,471, 511,512,513,514,515,516, 700],
    suggestedSlotRange: [39, 44],
    color: '#ee8130',
  },
  {
    id: 'fossil',
    name: 'Fossil Pokemon',
    description: 'Pokemon revived from fossils',
    pokemonIds: [138,139, 140,141, 142, 345,346, 347,348, 408,409, 410,411, 564,565, 566,567, 696,697, 698,699, 880,881,882,883],
    suggestedSlotRange: [71, 76],
    color: '#b6a136',
  },
  {
    id: 'gift-pokemon',
    name: 'Gift Pokemon',
    description: 'Pokemon commonly received as gifts in-game',
    pokemonIds: [131, 133,134,135,136, 143, 175,176, 196,197, 447,448, 468, 470,471, 574,575,576, 700],
    suggestedSlotRange: [77, 82],
    color: '#d685ad',
  },
  {
    id: 'industrial',
    name: 'Industrial/Man-Made',
    description: 'Mechanical, pollution, and man-made Pokemon found in urban/industrial areas',
    pokemonIds: [81,82, 88,89, 100,101, 109,110, 137,233,474, 462, 532,533,534, 568,569, 599,600,601, 707, 957,958,959],
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
    pokemonIds: [61,64,65, 67,68, 75,76, 93,94, 95,123,125,126,137,186,208,212,233,356,366,367,368,466,467,474,477,525,526],
    suggestedSlotRange: [113, 118],
    color: '#737373',
  },
  {
    id: 'pseudo-legendary',
    name: 'Pseudo-Legendary',
    description: 'Three-stage lines with 600 BST final form',
    pokemonIds: [147,148,149, 246,247,248, 371,372,373, 374,375,376, 443,444,445, 633,634,635, 704,705,706, 782,783,784, 885,886,887, 996,997,998],
    suggestedSlotRange: [140, 144],
    color: '#6f35fc',
  },
  {
    id: 'legendary-trio',
    name: 'Legendary Trio/Duo',
    description: 'Groups of lesser legendaries',
    pokemonIds: [144,145,146, 243,244,245, 377,378,379, 380,381, 480,481,482, 485,486,488, 638,639,640, 641,642,645, 772,773, 785,786,787,788, 891,892, 894,895,896,897,898, 905, 1001,1002,1003,1004, 1014,1015,1016,1017],
    suggestedSlotRange: [145, 147],
    color: '#f7d02c',
  },
  {
    id: 'box-legendary',
    name: 'Box Legendary',
    description: 'Cover legendaries / mascots',
    pokemonIds: [150, 249,250, 382,383,384, 483,484,487, 643,644,646, 716,717,718, 789,790,791,792,800, 888,889,890, 1007,1008,1024],
    suggestedSlotRange: [148, 149],
    color: '#dc2626',
  },
  {
    id: 'mythical',
    name: 'Mythical',
    description: 'Event-exclusive mythical Pokemon',
    pokemonIds: [151, 251, 385,386, 489,490,491,492,493, 494, 647,648,649, 719,720,721, 801,802,807,808,809, 893, 1025],
    suggestedSlotRange: [150, 151],
    color: '#f95587',
  },
  {
    id: 'baby-pokemon',
    name: 'Baby Pokemon',
    description: 'Baby pre-evolution Pokemon',
    pokemonIds: [172,173,174,175,236,238,239,240,298,360,406,433,438,439,440,446,447,458],
    suggestedSlotRange: [77, 82],
    color: '#d685ad',
  },
  {
    id: 'mimic',
    name: 'Mimic/Disguise',
    description: 'Pokemon that mimic objects or other Pokemon',
    pokemonIds: [100,101, 132, 185, 438, 570,571, 590,591, 778, 854,855],
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
      518, 555, 571, 637, 612,
      // XY
      // SM/USUM
      // SwSh
      // Legends Arceus
      77,
      // SV Titans
      950, 962, 968, 977, 978,
    ],
    suggestedSlotRange: [40, 50],
    color: '#f95587',
    // Red Gyarados (Lake of Rage), Shiny Ponyta (PLA), Shiny Haxorus (BW2 Nature Preserve)
    shinyIds: [130, 77, 612],
    subgroups: [
      { label: 'Red/Blue/Yellow', pokemonIds: [100,101, 131, 143] },
      { label: 'Gold/Silver/Crystal', pokemonIds: [130, 185] },
      { label: 'Ruby/Sapphire/Emerald', pokemonIds: [351, 352] },
      { label: 'Diamond/Pearl/Platinum', pokemonIds: [425, 442, 479] },
      { label: 'Black/White/BW2', pokemonIds: [518, 555, 571, 637, 612] },
      { label: 'Legends: Arceus', pokemonIds: [77] },
      { label: 'Scarlet/Violet Titans', pokemonIds: [950, 962, 968, 977, 978] },
    ],
  },
  {
    id: 'evil-team',
    name: 'Evil Team Pokemon',
    description: 'Pokemon commonly used by villain teams',
    pokemonIds: [41,42, 109,110, 169, 198, 228,229, 261,262, 430, 434,435, 551,552,553, 559,560, 747,748, 757,758],
    suggestedSlotRange: [50, 60],
    color: '#705746',
  },
  {
    id: 'rivalry-pair',
    name: 'Rivalry Pair',
    description: 'Thematic opposites that appear together',
    pokemonIds: [106,107, 128, 236,237, 241, 311,312, 313,314, 335,336, 337,338, 538,539, 631,632, 765,766, 874,875],
    suggestedSlotRange: [50, 55],
    color: '#c22e28',
  },
  {
    id: 'ultra-beast',
    name: 'Ultra Beast',
    description: 'Extradimensional Pokemon from Ultra Space',
    pokemonIds: [793,794,795,796,797,798,799, 803,804,805,806],
    suggestedSlotRange: [145, 150],
    color: '#1a1a1a',
  },
  {
    id: 'paradox',
    name: 'Paradox Pokemon',
    description: 'Ancient/future Pokemon from Gen 9',
    pokemonIds: [984,985,986,987,988,989, 990,991,992,993,994,995, 1005,1006, 1009,1010, 1020,1021,1022,1023],
    suggestedSlotRange: [140, 150],
    color: '#E3350D',
  },
  {
    id: 'cross-gen-evo',
    name: 'Cross-Gen Evolution',
    description: 'Pokemon that gained new evolutions or pre-evolutions in later generations',
    pokemonIds: [
      // Gen 2 evos of Gen 1
      169,182,186,196,197,199,208,212,230,233,242,
      // Gen 2 babies of Gen 1
      172,173,174,236,238,239,240,
      // Gen 3 babies of Gen 2
      298,360,
      // Gen 4 evos (forward)
      407,424,429,430,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478,
      // Gen 4 babies
      406,433,438,439,440,446,458,
      // Gen 6
      700,
      // Gen 8
      862,863,864,865,866,867,
      // Gen 8 (Legends Arceus)
      899,900,901,902,903,904,
      // Gen 9
      979,980,981,982,983,1011,1018,
    ],
    suggestedSlotRange: [50, 80],
    color: '#9966cc',
    subgroups: [
      { label: 'Gen 2', pokemonIds: [169,172,173,174,182,186,196,197,199,208,212,230,233,236,238,239,240,242] },
      { label: 'Gen 3', pokemonIds: [298,360] },
      { label: 'Gen 4', pokemonIds: [406,407,424,429,430,433,438,439,440,446,458,461,462,463,464,465,466,467,468,469,470,471,472,473,474,475,476,477,478] },
      { label: 'Gen 6', pokemonIds: [700] },
      { label: 'Gen 8', pokemonIds: [862,863,864,865,866,867] },
      { label: 'Legends Arceus', pokemonIds: [899,900,901,902,903,904] },
      { label: 'Gen 9', pokemonIds: [979,980,981,982,983,1011,1018] },
    ],
  },
  {
    id: 'gym-champion-ace',
    name: 'Gym/Champion Ace',
    description: 'Signature Pokemon of Gym Leaders, Elite Four & Champions, ordered by gym progression',
    pokemonIds: [
      // Kanto: Brock→Misty→Surge→Erika→Koga→Sabrina→Blaine→Giovanni, E4 Lance, Champion Blue
      95,121,26,45,89,65,59,34,149,6,
      // Johto: Falkner→Bugsy→Whitney→Morty→Chuck→Jasmine→Pryce→Clair
      18,123,241,94,62,208,221,230,
      // Hoenn: Roxanne→Brawly→Wattson→Flannery→Norman→Winona→Tate&Liza→Wallace, E4, Champion Steven
      299,297,310,324,289,334,337,350, 359,356,365,373, 376,
      // Sinnoh: Roark→Gardenia→Maylene→Wake→Fantina→Byron→Candice→Volkner, E4, Champion Cynthia
      408,407,448,419,429,411,460,466, 452,450,392,437, 445,
      // Unova: Watchog→Leavanny→Zebstrika→Excadrill→Swanna→Beartic→Iris, E4, Champion Alder
      505,542,523,530,581,614,612, 609,625,579,534, 637,
      // Kalos: Vivillon→Gogoat→Heliolisk→Sylveon→Meowstic→Avalugg, E4, Wikstrom
      666,673,695,700,678,713, 663,681,691,689,
      // Alola: Kahunas + E4
      735,752,754,745, 777,770,750, 740,733,
      // Galar: Milo→Nessa→Kabu→Opal→Piers→Raihan
      830,834,851, 869,862,884,
      // Paldea: Iono, E4 Rika→Poppy→Larry→Champion Geeta
      939, 980,959,983,
    ],
    suggestedSlotRange: [40, 60],
    color: '#f5a623',
    subgroups: [
      // Gym order → E4 → Champion
      { label: 'Kanto', pokemonIds: [95,121,26,45,89,65,59,34,149,6] },
      { label: 'Johto', pokemonIds: [18,123,241,94,62,208,221,230] },
      { label: 'Hoenn', pokemonIds: [299,297,310,324,289,334,337,350, 359,356,365,373, 376] },
      { label: 'Sinnoh', pokemonIds: [408,407,448,419,429,411,460,466, 452,450,392,437, 445] },
      { label: 'Unova', pokemonIds: [505,542,523,530,581,614,612, 609,625,579,534, 637] },
      { label: 'Kalos', pokemonIds: [666,673,695,700,678,713, 663,681,691,689] },
      { label: 'Alola', pokemonIds: [735,752,754,745, 777,770,750, 740,733] },
      { label: 'Galar', pokemonIds: [830,834,851, 869,862,884] },
      { label: 'Paldea', pokemonIds: [939, 980,959,983] },
    ],
  },
];

export function getArchetypeById(id: string): Archetype | undefined {
  return ARCHETYPES.find(a => a.id === id);
}

export function getArchetypesForPokemon(pokemonId: number): Archetype[] {
  return ARCHETYPES.filter(a => a.pokemonIds.includes(pokemonId));
}
