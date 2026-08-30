import type { TypeName } from '@/types/pokemon';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine } from '../model/engine';
import type { Powerup } from '../model/powerups';
import { SLOT_COUNT } from '../model/constants';

/**
 * A Kanto league, seeded so preview builds open on a full template.
 *
 * All fourteen slots, six lines each: the eight Kanto gym leaders, the Elite
 * Four, the champion, and Red on Mt. Silver. It is a fixture, not content —
 * `seedLeague.ts` writes it only on a preview build's first visit, and never
 * on production.
 *
 * The teams are the HeartGold/SoulSilver ones, taken from the game's own
 * trainer table (`files/poketool/trainer/trainers.json` in the pret
 * decompilation) rather than typed out: the gym leaders' REMATCH parties, the
 * Elite Four's second-round parties, Lance, and Red. Every species was
 * resolved against `src/data/pokemon.json` and every branch computed by
 * walking `evolvesFrom`, so no id here was written by hand.
 *
 * Two liberties, both deliberate:
 *
 * 1. **Seat order is by level, highest first.** Seat 1 is the rightmost
 *    column — the ace — so each leader's strongest Pokémon leads. Ties keep
 *    the game's own party order.
 * 2. **Baby stages are stripped**, so Raichu arrives without Pichu and Jynx
 *    without Smoochum. The picker still seats the baby; that question is open
 *    in DECISIONS.md. Bruno's three Hitmons are the visible effect: without
 *    Tyrogue they are three one-member lines rather than three copies of the
 *    same branch.
 *
 * Mewtwo on the boss row is the one thing not from the game. Red has no
 * legendary, and the slot needs exercising.
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
    theme: 'Brock\'s unyielding rock',
    badgeName: 'Boulder',
    branches: [
      [95],   // onix lv61
      [408, 409],   // rampardos lv57
      [138, 139],   // omastar lv56
      [74, 75, 76],   // golem lv55
      [140, 141],   // kabutops lv55
      [369],   // relicanth lv54
    ],
    tmMoveId: 157,
  },
  {
    slot: 1,
    type: 'water',
    theme: 'Misty\'s tidal power',
    badgeName: 'Cascade',
    branches: [
      [120, 121],   // starmie lv60
      [349, 350],   // milotic lv60
      [194, 195],   // quagsire lv56
      [131],   // lapras lv56
      [170, 171],   // lanturn lv54
      [418, 419],   // floatzel lv54
    ],
    tmMoveId: 57,
  },
  {
    slot: 2,
    type: 'electric',
    theme: 'Lt. Surge\'s lightning',
    badgeName: 'Thunder',
    branches: [
      [25, 26],   // raichu lv60
      [417],   // pachirisu lv58
      [125, 466],   // electivire lv56
      [309, 310],   // manectric lv52
      [81, 82, 462],   // magnezone lv52
      [100, 101],   // electrode lv52
    ],
    tmMoveId: 85,
  },
  {
    slot: 3,
    type: 'grass',
    theme: 'Erika\'s fragrant garden',
    badgeName: 'Rainbow',
    branches: [
      [114, 465],   // tangrowth lv60
      [69, 70, 71],   // victreebel lv56
      [43, 44, 182],   // bellossom lv56
      [315, 407],   // roserade lv55
      [273, 274, 275],   // shiftry lv54
      [187, 188, 189],   // jumpluff lv53
    ],
    tmMoveId: 202,
  },
  {
    slot: 4,
    type: 'poison',
    theme: 'Janine\'s ninja poisons',
    badgeName: 'Soul',
    branches: [
      [48, 49],   // venomoth lv59
      [167, 168],   // ariados lv58
      [109, 110],   // weezing lv56
      [451, 452],   // drapion lv55
      [41, 42, 169],   // crobat lv52
      [453, 454],   // toxicroak lv52
    ],
    tmMoveId: 188,
  },
  {
    slot: 5,
    type: 'psychic',
    theme: 'Sabrina\'s psychic will',
    badgeName: 'Marsh',
    branches: [
      [63, 64, 65],   // alakazam lv60
      [133, 196],   // espeon lv58
      [122],   // mr-mime lv56
      [124],   // jynx lv54
      [202],   // wobbuffet lv53
      [280, 281, 475],   // gallade lv53
    ],
    tmMoveId: 94,
  },
  {
    slot: 6,
    type: 'fire',
    theme: 'Blaine\'s burning quiz',
    badgeName: 'Volcano',
    branches: [
      [126, 467],   // magmortar lv62
      [77, 78],   // rapidash lv60
      [218, 219],   // magcargo lv58
      [322, 323],   // camerupt lv57
      [324],   // torkoal lv54
      [228, 229],   // houndoom lv54
    ],
    tmMoveId: 53,
  },
  {
    slot: 7,
    type: 'none',
    theme: 'Blue\'s Viridian challenge',
    badgeName: 'Earth',
    branches: [
      [16, 17, 18],   // pidgeot lv72
      [111, 112, 464],   // rhyperior lv70
      [246, 247, 248],   // tyranitar lv70
      [66, 67, 68],   // machamp lv69
      [58, 59],   // arcanine lv68
      [102, 103],   // exeggutor lv67
    ],
    tmMoveId: 63,
  },
  {
    slot: 8,
    type: 'psychic',
    theme: 'Will\'s practised mind',
    branches: [
      [177, 178],   // xatu lv62
      [280, 281, 282],   // gardevoir lv61
      [124],   // jynx lv60
      [79, 80],   // slowbro lv60
      [325, 326],   // grumpig lv59
      [436, 437],   // bronzong lv58
    ],
    tmMoveId: 248,
  },
  {
    slot: 9,
    type: 'poison',
    theme: 'Koga\'s ninja arts',
    branches: [
      [41, 42, 169],   // crobat lv64
      [48, 49],   // venomoth lv63
      [88, 89],   // muk lv62
      [316, 317],   // swalot lv62
      [434, 435],   // skuntank lv61
      [453, 454],   // toxicroak lv60
    ],
    tmMoveId: 92,
  },
  {
    slot: 10,
    type: 'fighting',
    theme: 'Bruno\'s iron body',
    branches: [
      [66, 67, 68],   // machamp lv64
      [448],   // lucario lv64
      [237],   // hitmontop lv62
      [296, 297],   // hariyama lv62
      [106],   // hitmonlee lv61
      [107],   // hitmonchan lv61
    ],
    tmMoveId: 280,
  },
  {
    slot: 11,
    type: 'dark',
    theme: 'Karen\'s strong and beautiful',
    branches: [
      [198, 430],   // honchkrow lv64
      [133, 197],   // umbreon lv64
      [228, 229],   // houndoom lv63
      [215, 461],   // weavile lv62
      [442],   // spiritomb lv62
      [359],   // absol lv62
    ],
    tmMoveId: 399,
  },
  {
    slot: 12,
    type: 'dragon',
    theme: 'Lance\'s dragon mastery',
    branches: [
      [147, 148, 149],   // dragonite lv75
      [333, 334],   // altaria lv73
      [371, 372, 373],   // salamence lv72
      [443, 444, 445],   // garchomp lv72
      [129, 130],   // gyarados lv68
      [4, 5, 6],   // charizard lv68
    ],
    tmMoveId: 434,
    powerup: { seat: 3, kind: 'mega', index: 0 },
  },
  {
    slot: 13,
    type: 'none',
    theme: 'Red\'s silent challenge',
    branches: [
      [25],   // pikachu lv88
      [1, 2, 3],   // venusaur lv84
      [4, 5, 6],   // charizard lv84
      [7, 8, 9],   // blastoise lv84
      [143],   // snorlax lv82
      [131],   // lapras lv80
    ],
    tmMoveId: 34,
    powerup: { seat: 3, kind: 'dynamax', index: 0 },
    legend: [150, 6],
  },
];

export const KANTO_LEAGUE_NAME = 'Kanto League';

/** The seeded cards, in slot order. */
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
