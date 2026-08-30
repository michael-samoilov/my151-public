import type { TypeName } from '@/types/pokemon';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import type { Powerup } from '../model/powerups';
import { SLOT_COUNT } from '../model/constants';

/**
 * A Kanto league, seeded so preview builds open on a full template.
 *
 * Six gyms, three Elite Four members, a champion and an endgame boss — the
 * rest of the slots stay empty on purpose, so both states are there to build
 * against. It is a fixture, not content: `seedLeague.ts` writes it only on a
 * preview build's first visit, and never on production.
 *
 * Branches start at the Kanto stage rather than the true root, so Pikachu
 * arrives without Pichu and Jynx without Smoochum. The picker still seats the
 * baby — that question is open in DECISIONS.md — but a Kanto league that
 * opens on five baby Pokémon is not the fixture anyone wants.
 */

interface SeedCard {
  slot: number;
  type: TypeName | 'none';
  theme: string;
  badgeName?: string;
  /** Seat 1 first: seat 1 is the rightmost column, the leader's ace. */
  branches: number[][];
  tmMoveId: number;
  powerup?: Powerup;
  /** `[pokemonId, seat]` for the endgame boss's legendary. */
  legend?: [number, number];
}

const SEED: SeedCard[] = [
  {
    slot: 0,
    type: 'rock',
    theme: "Brock's unyielding rock",
    badgeName: 'Boulder',
    branches: [[95], [74, 75, 76]],
    tmMoveId: 317, // Rock Tomb
  },
  {
    slot: 1,
    type: 'water',
    theme: "Misty's tidal power",
    badgeName: 'Cascade',
    branches: [[120, 121], [54, 55], [118, 119]],
    tmMoveId: 352, // Water Pulse
  },
  {
    slot: 2,
    type: 'electric',
    theme: "Lt. Surge's lightning",
    badgeName: 'Thunder',
    branches: [[25, 26], [100, 101], [81, 82]],
    tmMoveId: 85, // Thunderbolt
  },
  {
    slot: 3,
    type: 'grass',
    theme: "Erika's fragrant garden",
    badgeName: 'Rainbow',
    branches: [[43, 44, 45], [69, 70, 71], [114]],
    tmMoveId: 202, // Giga Drain
  },
  {
    slot: 4,
    type: 'poison',
    theme: "Koga's poison arts",
    badgeName: 'Soul',
    branches: [[109, 110], [88, 89], [48, 49], [41, 42]],
    tmMoveId: 92, // Toxic
  },
  {
    slot: 5,
    type: 'psychic',
    theme: "Sabrina's psychic will",
    badgeName: 'Marsh',
    branches: [[63, 64, 65], [96, 97], [122], [79, 80]],
    tmMoveId: 94, // Psychic
  },
  // Gyms 7 and 8 (Blaine, Giovanni) stay empty.
  {
    slot: 8,
    type: 'ice',
    theme: "Lorelei's frozen sea",
    branches: [[131], [86, 87], [90, 91], [124], [79, 80]],
    tmMoveId: 58, // Ice Beam
  },
  {
    slot: 9,
    type: 'fighting',
    theme: "Bruno's iron fists",
    branches: [[66, 67, 68], [106], [107], [95], [74, 75, 76]],
    tmMoveId: 280, // Brick Break
  },
  {
    slot: 10,
    type: 'ghost',
    theme: "Agatha's old spirits",
    branches: [[92, 93, 94], [41, 42], [23, 24], [109, 110], [96, 97]],
    tmMoveId: 247, // Shadow Ball
  },
  // Elite Four 4 (Lance) stays empty.
  {
    slot: 12,
    type: 'none',
    theme: "Blue's rival team",
    branches: [
      [4, 5, 6],
      [16, 17, 18],
      [63, 64, 65],
      [111, 112],
      [58, 59],
      [102, 103],
    ],
    tmMoveId: 63, // Hyper Beam
    // Mega Charizard X on the ace, so the champion card opens on a powerup.
    powerup: { seat: 1, kind: 'mega', index: 0 },
  },
  {
    slot: 13,
    type: 'none',
    theme: "Red's silent challenge",
    branches: [[25], [1, 2, 3], [4, 5, 6], [7, 8, 9], [143], [133, 196]],
    tmMoveId: 34, // Body Slam
    // Gigantamax Charizard, so the two powerup kinds both show in the seed.
    powerup: { seat: 3, kind: 'dynamax', index: 0 },
    // Mewtwo covers the last seat on the boss row only.
    legend: [150, 6],
  },
];

export const KANTO_LEAGUE_NAME = 'Kanto League';

/** The seeded cards, in slot order, with untouched slots left empty. */
export function kantoCards(): GymCard[] {
  const cards = Array.from({ length: SLOT_COUNT }, emptyCard);
  for (const seed of SEED) {
    cards[seed.slot] = {
      type: seed.type,
      theme: seed.theme,
      lines: seed.branches.map(makePlacedLine),
      // The ace carries the signature on every seeded card.
      signatureSeat: 1,
      tmMoveId: seed.tmMoveId,
      badgeName: seed.badgeName ?? '',
      legend: seed.legend ? { pokemonId: seed.legend[0], seat: seed.legend[1] } : null,
      powerup: seed.powerup ?? null,
    };
  }
  return cards;
}
