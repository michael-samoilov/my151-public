import type { TypeName } from '@/types/pokemon';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine, setBoundary } from '../model/engine';
import type { Powerup } from '../model/powerups';
import { ROW_COUNT, SLOT_COUNT } from '../model/constants';

interface SeedLine {
  branch: number[];
  pin?: number;
}

interface SeedCard {
  slot: number;
  type: TypeName | 'none';
  theme: string;
  badgeName?: string;
  lines: SeedLine[];
  tmMoveId: number;
  powerup?: Powerup;
  legend?: [number, number];
}

const SEED: SeedCard[] = [
  {
    slot: 0,
    type: 'rock',
    theme: 'Brock\'s unyielding rock',
    badgeName: 'Boulder',
    lines: [
      { branch: [95, 208], pin: 95 },
      { branch: [408, 409] },
      { branch: [138, 139] },
      { branch: [74, 75, 76] },
      { branch: [140, 141] },
      { branch: [369] },
    ],
    tmMoveId: 157,
  },
  {
    slot: 1,
    type: 'water',
    theme: 'Misty\'s tidal power',
    badgeName: 'Cascade',
    lines: [
      { branch: [120, 121] },
      { branch: [349, 350] },
      { branch: [194, 195] },
      { branch: [131] },
      { branch: [170, 171] },
      { branch: [418, 419] },
    ],
    tmMoveId: 57,
  },
  {
    slot: 2,
    type: 'electric',
    theme: 'Lt. Surge\'s lightning',
    badgeName: 'Thunder',
    lines: [
      { branch: [172, 25, 26] },
      { branch: [417] },
      { branch: [239, 125, 466] },
      { branch: [309, 310] },
      { branch: [81, 82, 462] },
      { branch: [100, 101] },
    ],
    tmMoveId: 85,
  },
  {
    slot: 3,
    type: 'grass',
    theme: 'Erika\'s fragrant garden',
    badgeName: 'Rainbow',
    lines: [
      { branch: [114, 465] },
      { branch: [69, 70, 71] },
      { branch: [43, 44, 182] },
      { branch: [406, 315, 407] },
      { branch: [273, 274, 275] },
      { branch: [187, 188, 189] },
    ],
    tmMoveId: 202,
  },
  {
    slot: 4,
    type: 'poison',
    theme: 'Janine\'s ninja poisons',
    badgeName: 'Soul',
    lines: [
      { branch: [48, 49] },
      { branch: [167, 168] },
      { branch: [109, 110] },
      { branch: [451, 452] },
      { branch: [41, 42, 169] },
      { branch: [453, 454] },
    ],
    tmMoveId: 188,
  },
  {
    slot: 5,
    type: 'psychic',
    theme: 'Sabrina\'s psychic will',
    badgeName: 'Marsh',
    lines: [
      { branch: [63, 64, 65] },
      { branch: [133, 196] },
      { branch: [439, 122] },
      { branch: [238, 124] },
      { branch: [360, 202] },
      { branch: [280, 281, 475] },
    ],
    tmMoveId: 94,
  },
  {
    slot: 6,
    type: 'fire',
    theme: 'Blaine\'s burning quiz',
    badgeName: 'Volcano',
    lines: [
      { branch: [240, 126, 467] },
      { branch: [77, 78] },
      { branch: [218, 219] },
      { branch: [322, 323] },
      { branch: [324] },
      { branch: [228, 229] },
    ],
    tmMoveId: 53,
  },
  {
    slot: 7,
    type: 'none',
    theme: 'Blue\'s Viridian challenge',
    badgeName: 'Earth',
    lines: [
      { branch: [16, 17, 18] },
      { branch: [111, 112, 464] },
      { branch: [246, 247, 248] },
      { branch: [66, 67, 68] },
      { branch: [58, 59] },
      { branch: [102, 103] },
    ],
    tmMoveId: 63,
  },
  {
    slot: 8,
    type: 'psychic',
    theme: 'Will\'s practised mind',
    lines: [
      { branch: [177, 178] },
      { branch: [280, 281, 282] },
      { branch: [238, 124] },
      { branch: [79, 80] },
      { branch: [325, 326] },
      { branch: [436, 437] },
    ],
    tmMoveId: 248,
  },
  {
    slot: 9,
    type: 'poison',
    theme: 'Koga\'s ninja arts',
    lines: [
      { branch: [41, 42, 169] },
      { branch: [48, 49] },
      { branch: [88, 89] },
      { branch: [316, 317] },
      { branch: [434, 435] },
      { branch: [453, 454] },
    ],
    tmMoveId: 92,
  },
  {
    slot: 10,
    type: 'fighting',
    theme: 'Bruno\'s iron body',
    lines: [
      { branch: [66, 67, 68] },
      { branch: [447, 448] },
      { branch: [236, 237] },
      { branch: [296, 297] },
      { branch: [236, 106] },
      { branch: [236, 107] },
    ],
    tmMoveId: 280,
  },
  {
    slot: 11,
    type: 'dark',
    theme: 'Karen\'s strong and beautiful',
    lines: [
      { branch: [198, 430] },
      { branch: [133, 197] },
      { branch: [228, 229] },
      { branch: [215, 461] },
      { branch: [442] },
      { branch: [359] },
    ],
    tmMoveId: 399,
  },
  {
    slot: 12,
    type: 'dragon',
    theme: 'Lance\'s dragon mastery',
    lines: [
      { branch: [147, 148, 149] },
      { branch: [333, 334] },
      { branch: [371, 372, 373] },
      { branch: [443, 444, 445] },
      { branch: [129, 130] },
      { branch: [4, 5, 6] },
    ],
    tmMoveId: 434,
    powerup: { seat: 3, kind: 'mega', index: 0 },
  },
  {
    slot: 13,
    type: 'none',
    theme: 'Red\'s silent challenge',
    lines: [
      { branch: [172, 25, 26], pin: 25 },
      { branch: [1, 2, 3] },
      { branch: [4, 5, 6] },
      { branch: [7, 8, 9] },
      { branch: [446, 143] },
      { branch: [131] },
    ],
    tmMoveId: 34,
    powerup: { seat: 3, kind: 'dynamax', index: 0 },
    legend: [150, 6],
  },
];

export const KANTO_LEAGUE_NAME = 'Kanto League';

function seededLine(seed: SeedLine) {
  const line = makePlacedLine(seed.branch);
  if (seed.pin === undefined) return line;
  const stage = seed.branch.indexOf(seed.pin);
  if (stage < 0 || stage === seed.branch.length - 1) return line;
  return { ...line, boundaries: setBoundary(line, stage + 1, ROW_COUNT + 1), boundaryMode: 'manual' as const };
}

function aceId(seed: SeedLine | undefined): number | null {
  if (!seed) return null;
  return seed.pin ?? seed.branch[seed.branch.length - 1] ?? null;
}

const BLANK_SLOTS = new Set([6, 9]);

export function kantoCards({ full = false }: { full?: boolean } = {}): GymCard[] {
  const cards = Array.from({ length: SLOT_COUNT }, emptyCard);
  for (const seed of SEED) {
    if (!full && BLANK_SLOTS.has(seed.slot)) continue;
    cards[seed.slot] = {
      type: seed.type,
      theme: seed.theme,
      lines: seed.lines.map(seededLine),
      signatureSeat: 1,
      signatureId: aceId(seed.lines[0]),
      tmMoveId: seed.tmMoveId,
      badgeName: seed.badgeName ?? '',
      legends: seed.legend ? [{ pokemonId: seed.legend[0], seat: seed.legend[1] }] : [],
      legend: null,
      powerup: seed.powerup ?? null,
    };
  }
  return cards;
}
