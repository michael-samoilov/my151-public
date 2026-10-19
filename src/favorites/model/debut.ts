import type { GenNumber } from './cells';
import { isPowerupForm, type PickerMon } from './catalog';

const DEBUT_GAMES = [
  'RB', 'GS', 'RS', 'FRLG', 'E', 'PMD', 'DP', 'Pt', 'HGSS', 'BW', 'B2W2', 'XY', 'ORAS',
  'SM', 'USUM', 'LGPE', 'SwSh', 'PLA', 'SV', 'PLZA', 'Pokopia',
] as const;
type DebutGame = (typeof DEBUT_GAMES)[number];

const GENERATION_GAME: Record<GenNumber, DebutGame> = {
  1: 'RB', 2: 'GS', 3: 'RS', 4: 'DP', 5: 'BW', 6: 'XY', 7: 'SM', 8: 'SwSh', 9: 'SV',
};

const REGION_GAME: Record<string, DebutGame> = {
  alola: 'SM', galar: 'SwSh', hisui: 'PLA', paldea: 'SV',
};
const REGION_RE = /-(alola|galar|hisui|paldea)(?:-|$)/;

const LATER_DEBUTS: readonly (readonly [first: number, last: number, game: DebutGame])[] = [
  [10001, 10002, 'FRLG'],
  [10003, 10003, 'E'],
  [11122, 11122, 'PMD'],
  [10006, 10012, 'Pt'],
  [11064, 11064, 'HGSS'],
  [10019, 10023, 'B2W2'],
  [11107, 11108, 'B2W2'],
  [10062, 10090, 'ORAS'],
  [803, 807, 'USUM'],
  [10148, 10148, 'USUM'],
  [10152, 10152, 'USUM'],
  [10155, 10157, 'USUM'],
  [808, 809, 'LGPE'],
  [899, 905, 'PLA'],
  [10245, 10249, 'PLA'],
  [10278, 10325, 'PLZA'],
  [11112, 11112, 'Pokopia'],
  [11117, 11117, 'Pokopia'],
];

function debutGame(mon: PickerMon): DebutGame {
  const listed = LATER_DEBUTS.find(([first, last]) => mon.id >= first && mon.id <= last);
  if (listed) return listed[2];
  if (mon.name.startsWith('Gigantamax ')) return 'SwSh';
  if (isPowerupForm(mon)) return 'XY';
  const region = REGION_RE.exec(mon.name)?.[1];
  if (region) return REGION_GAME[region];
  return GENERATION_GAME[mon.generation];
}

const GAME_REGION: Record<DebutGame, `${GenNumber} ${string}`> = {
  RB: '1 kanto', GS: '2 johto', RS: '3 hoenn', FRLG: '3 kanto', E: '3 hoenn', PMD: '3 mystery-dungeon',
  DP: '4 sinnoh', Pt: '4 sinnoh', HGSS: '4 johto', BW: '5 unova', B2W2: '5 unova',
  XY: '6 kalos', ORAS: '6 hoenn', SM: '7 alola', USUM: '7 alola', LGPE: '7 kanto',
  SwSh: '8 galar', PLA: '8 hisui', SV: '9 paldea', PLZA: '9 kalos', Pokopia: '9 pokopia',
};

export function debutRank(mon: PickerMon): number {
  const region = GAME_REGION[debutGame(mon)];
  return DEBUT_GAMES.findIndex((game) => GAME_REGION[game] === region);
}
