import type { GenNumber } from './cells';
import { isPowerupForm, type PickerMon } from './catalog';

/**
 * Main-series games in release order, limited to games where a picker entry
 * debuted. RB stands for Red, Green, Blue, and Yellow, and GS for Gold,
 * Silver, and Crystal. Sword/Shield and Scarlet/Violet include their DLC.
 */
export const DEBUT_GAMES = [
  'RB', 'GS', 'RS', 'FRLG', 'E', 'DP', 'Pt', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS',
  'SM', 'USUM', 'LGPE', 'SwSh', 'PLA', 'SV', 'PLZA',
] as const;
export type DebutGame = (typeof DEBUT_GAMES)[number];

const GENERATION_GAME: Record<GenNumber, DebutGame> = {
  1: 'RB', 2: 'GS', 3: 'RS', 4: 'DP', 5: 'BW', 6: 'XY', 7: 'SM', 8: 'SwSh', 9: 'SV',
};

const REGION_GAME: Record<string, DebutGame> = {
  alola: 'SM', galar: 'SwSh', hisui: 'PLA', paldea: 'SV',
};
const REGION_RE = /-(alola|galar|hisui|paldea)(?:-|$)/;

/**
 * Picker IDs, inclusive ranges, that debuted after the first game of their
 * generation row. Every other entry follows the rules in `debutGame`.
 */
const LATER_DEBUTS: readonly (readonly [first: number, last: number, game: DebutGame])[] = [
  [10001, 10002, 'FRLG'], // Deoxys Attack and Defense Formes
  [10003, 10003, 'E'], // Deoxys Speed Forme
  [10006, 10012, 'Pt'], // Shaymin Sky, Giratina Origin, Rotom appliances
  [11064, 11064, 'HGSS'], // Spiky-eared Pichu
  [10019, 10023, 'B2W2'], // Therian Formes, Black and White Kyurem
  [10062, 10090, 'ORAS'], // ORAS Megas, Primal Reversion, Cosplay Pikachu, Hoopa Unbound
  [803, 807, 'USUM'], // Poipole to Zeraora
  [10148, 10148, 'USUM'], // Partner Cap Pikachu
  [10152, 10152, 'USUM'], // Dusk Lycanroc
  [10155, 10157, 'USUM'], // Dusk Mane, Dawn Wings, and Ultra Necrozma
  [808, 809, 'LGPE'], // Meltan and Melmetal
  [899, 905, 'PLA'], // Wyrdeer to Enamorus
  [10245, 10249, 'PLA'], // Origin Dialga and Palkia, White-Striped Basculin, female Basculegion, Therian Enamorus
  [10278, 10325, 'PLZA'], // Legends: Z-A Megas, including Mega Dimension
];

export function debutGame(mon: PickerMon): DebutGame {
  const listed = LATER_DEBUTS.find(([first, last]) => mon.id >= first && mon.id <= last);
  if (listed) return listed[2];
  if (mon.name.startsWith('Gigantamax ')) return 'SwSh';
  if (isPowerupForm(mon)) return 'XY'; // A Mega not listed above.
  const region = REGION_RE.exec(mon.name)?.[1];
  if (region) return REGION_GAME[region];
  return GENERATION_GAME[mon.generation];
}

/**
 * Each game's generation and primary region. Games that share both are one
 * debut: B2W2 sorts with BW, USUM with SM, and Emerald with Ruby and
 * Sapphire. A game in the same generation but another region stays apart:
 * FRLG, HGSS, ORAS, LGPE, PLA, and PLZA.
 */
const GAME_REGION: Record<DebutGame, `${GenNumber} ${string}`> = {
  RB: '1 kanto', GS: '2 johto', RS: '3 hoenn', FRLG: '3 kanto', E: '3 hoenn',
  DP: '4 sinnoh', Pt: '4 sinnoh', HGSS: '4 johto', BW: '5 unova', B2W2: '5 unova',
  XY: '6 kalos', ORAS: '6 hoenn', SM: '7 alola', USUM: '7 alola', LGPE: '7 kanto',
  SwSh: '8 galar', PLA: '8 hisui', SV: '9 paldea', PLZA: '9 kalos',
};

/** Release position of the entry's debut region. Earlier regions sort first. */
export function debutRank(mon: PickerMon): number {
  const region = GAME_REGION[debutGame(mon)];
  return DEBUT_GAMES.findIndex((game) => GAME_REGION[game] === region);
}
