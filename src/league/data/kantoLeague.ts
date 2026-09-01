import type { TypeName } from '@/types/pokemon';
import { emptyCard, type GymCard } from '../store/useLeagueStore';
import { makePlacedLine, setBoundary } from '../model/engine';
import type { Powerup } from '../model/powerups';
import { ROW_COUNT, SLOT_COUNT } from '../model/constants';

/**
 * A Kanto league, seeded so preview builds open on a full template.
 *
 * Fourteen slots, six lines each: the eight Kanto gym leaders, the Elite
 * Four, the champion, and Red on Mt. Silver. Two of them are then blanked
 * again by `BLANK_SLOTS`, so the preview opens with the empty row on screen
 * next to the filled ones. It is a fixture, not content - `seedLeague.ts`
 * writes it only on a preview build's first visit, and never on production.
 *
 * The teams are the HeartGold/SoulSilver ones, read from the game's own
 * trainer table (`files/poketool/trainer/trainers.json` in the pret
 * decompilation): the gym leaders' REMATCH parties, the Elite Four's
 * second-round parties, Lance, and Red. A script resolved every species
 * against `src/data/pokemon.json` and built every branch by walking
 * `evolvesFrom`, so no id here was written by hand.
 *
 * **Nothing here is a state the app cannot reach on its own.** Two rules keep
 * it that way:
 *
 * 1. A line is the WHOLE line, root to leaf, exactly as the picker seats it -
 *    `branchEndingAt` walks to the root, so a baby stage comes along. Brock's
 *    team is Onix, but the line a picker hands you is Onix into Steelix.
 * 2. When the leader fields a stage that is not the leaf, `pin` names it and
 *    the seed reaches that state the way a person would: one `setBoundary`
 *    call, the same operation a downward drag performs, pushing the stage
 *    below off the bottom of the card. The line then reads as edited, blue
 *    reset button and all, because it IS edited.
 *
 * Only two lines need that today: Brock's Onix and Red's Pikachu. Everything
 * else is the leaf of its own chain and takes the level curve's own rows.
 *
 * Seat order is by level, highest first, so each leader's ace takes seat 1 -
 * the rightmost column - and carries the signature. Mewtwo on the boss row is
 * the one thing not from the game: Red has no legendary, and the slot needs
 * exercising.
 */

interface SeedLine {
  /** The whole line, root to leaf, as the picker seats it. */
  branch: number[];
  /** The stage the leader fields, when it is not the leaf. */
  pin?: number;
}

interface SeedCard {
  slot: number;
  type: TypeName | 'none';
  theme: string;
  badgeName?: string;
  /** Seat 1 first: seat 1 is the rightmost column, the leader's ace. */
  lines: SeedLine[];
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
    lines: [
      { branch: [95, 208], pin: 95 },   // onix > steelix, lv61
      { branch: [408, 409] },   // cranidos > rampardos, lv57
      { branch: [138, 139] },   // omanyte > omastar, lv56
      { branch: [74, 75, 76] },   // geodude > graveler > golem, lv55
      { branch: [140, 141] },   // kabuto > kabutops, lv55
      { branch: [369] },   // relicanth, lv54
    ],
    tmMoveId: 157,
  },
  {
    slot: 1,
    type: 'water',
    theme: 'Misty\'s tidal power',
    badgeName: 'Cascade',
    lines: [
      { branch: [120, 121] },   // staryu > starmie, lv60
      { branch: [349, 350] },   // feebas > milotic, lv60
      { branch: [194, 195] },   // wooper > quagsire, lv56
      { branch: [131] },   // lapras, lv56
      { branch: [170, 171] },   // chinchou > lanturn, lv54
      { branch: [418, 419] },   // buizel > floatzel, lv54
    ],
    tmMoveId: 57,
  },
  {
    slot: 2,
    type: 'electric',
    theme: 'Lt. Surge\'s lightning',
    badgeName: 'Thunder',
    lines: [
      { branch: [172, 25, 26] },   // pichu > pikachu > raichu, lv60
      { branch: [417] },   // pachirisu, lv58
      { branch: [239, 125, 466] },   // elekid > electabuzz > electivire, lv56
      { branch: [309, 310] },   // electrike > manectric, lv52
      { branch: [81, 82, 462] },   // magnemite > magneton > magnezone, lv52
      { branch: [100, 101] },   // voltorb > electrode, lv52
    ],
    tmMoveId: 85,
  },
  {
    slot: 3,
    type: 'grass',
    theme: 'Erika\'s fragrant garden',
    badgeName: 'Rainbow',
    lines: [
      { branch: [114, 465] },   // tangela > tangrowth, lv60
      { branch: [69, 70, 71] },   // bellsprout > weepinbell > victreebel, lv56
      { branch: [43, 44, 182] },   // oddish > gloom > bellossom, lv56
      { branch: [406, 315, 407] },   // budew > roselia > roserade, lv55
      { branch: [273, 274, 275] },   // seedot > nuzleaf > shiftry, lv54
      { branch: [187, 188, 189] },   // hoppip > skiploom > jumpluff, lv53
    ],
    tmMoveId: 202,
  },
  {
    slot: 4,
    type: 'poison',
    theme: 'Janine\'s ninja poisons',
    badgeName: 'Soul',
    lines: [
      { branch: [48, 49] },   // venonat > venomoth, lv59
      { branch: [167, 168] },   // spinarak > ariados, lv58
      { branch: [109, 110] },   // koffing > weezing, lv56
      { branch: [451, 452] },   // skorupi > drapion, lv55
      { branch: [41, 42, 169] },   // zubat > golbat > crobat, lv52
      { branch: [453, 454] },   // croagunk > toxicroak, lv52
    ],
    tmMoveId: 188,
  },
  {
    slot: 5,
    type: 'psychic',
    theme: 'Sabrina\'s psychic will',
    badgeName: 'Marsh',
    lines: [
      { branch: [63, 64, 65] },   // abra > kadabra > alakazam, lv60
      { branch: [133, 196] },   // eevee > espeon, lv58
      { branch: [439, 122] },   // mime-jr > mr-mime, lv56
      { branch: [238, 124] },   // smoochum > jynx, lv54
      { branch: [360, 202] },   // wynaut > wobbuffet, lv53
      { branch: [280, 281, 475] },   // ralts > kirlia > gallade, lv53
    ],
    tmMoveId: 94,
  },
  {
    slot: 6,
    type: 'fire',
    theme: 'Blaine\'s burning quiz',
    badgeName: 'Volcano',
    lines: [
      { branch: [240, 126, 467] },   // magby > magmar > magmortar, lv62
      { branch: [77, 78] },   // ponyta > rapidash, lv60
      { branch: [218, 219] },   // slugma > magcargo, lv58
      { branch: [322, 323] },   // numel > camerupt, lv57
      { branch: [324] },   // torkoal, lv54
      { branch: [228, 229] },   // houndour > houndoom, lv54
    ],
    tmMoveId: 53,
  },
  {
    slot: 7,
    type: 'none',
    theme: 'Blue\'s Viridian challenge',
    badgeName: 'Earth',
    lines: [
      { branch: [16, 17, 18] },   // pidgey > pidgeotto > pidgeot, lv72
      { branch: [111, 112, 464] },   // rhyhorn > rhydon > rhyperior, lv70
      { branch: [246, 247, 248] },   // larvitar > pupitar > tyranitar, lv70
      { branch: [66, 67, 68] },   // machop > machoke > machamp, lv69
      { branch: [58, 59] },   // growlithe > arcanine, lv68
      { branch: [102, 103] },   // exeggcute > exeggutor, lv67
    ],
    tmMoveId: 63,
  },
  {
    slot: 8,
    type: 'psychic',
    theme: 'Will\'s practised mind',
    lines: [
      { branch: [177, 178] },   // natu > xatu, lv62
      { branch: [280, 281, 282] },   // ralts > kirlia > gardevoir, lv61
      { branch: [238, 124] },   // smoochum > jynx, lv60
      { branch: [79, 80] },   // slowpoke > slowbro, lv60
      { branch: [325, 326] },   // spoink > grumpig, lv59
      { branch: [436, 437] },   // bronzor > bronzong, lv58
    ],
    tmMoveId: 248,
  },
  {
    slot: 9,
    type: 'poison',
    theme: 'Koga\'s ninja arts',
    lines: [
      { branch: [41, 42, 169] },   // zubat > golbat > crobat, lv64
      { branch: [48, 49] },   // venonat > venomoth, lv63
      { branch: [88, 89] },   // grimer > muk, lv62
      { branch: [316, 317] },   // gulpin > swalot, lv62
      { branch: [434, 435] },   // stunky > skuntank, lv61
      { branch: [453, 454] },   // croagunk > toxicroak, lv60
    ],
    tmMoveId: 92,
  },
  {
    slot: 10,
    type: 'fighting',
    theme: 'Bruno\'s iron body',
    lines: [
      { branch: [66, 67, 68] },   // machop > machoke > machamp, lv64
      { branch: [447, 448] },   // riolu > lucario, lv64
      { branch: [236, 237] },   // tyrogue > hitmontop, lv62
      { branch: [296, 297] },   // makuhita > hariyama, lv62
      { branch: [236, 106] },   // tyrogue > hitmonlee, lv61
      { branch: [236, 107] },   // tyrogue > hitmonchan, lv61
    ],
    tmMoveId: 280,
  },
  {
    slot: 11,
    type: 'dark',
    theme: 'Karen\'s strong and beautiful',
    lines: [
      { branch: [198, 430] },   // murkrow > honchkrow, lv64
      { branch: [133, 197] },   // eevee > umbreon, lv64
      { branch: [228, 229] },   // houndour > houndoom, lv63
      { branch: [215, 461] },   // sneasel > weavile, lv62
      { branch: [442] },   // spiritomb, lv62
      { branch: [359] },   // absol, lv62
    ],
    tmMoveId: 399,
  },
  {
    slot: 12,
    type: 'dragon',
    theme: 'Lance\'s dragon mastery',
    lines: [
      { branch: [147, 148, 149] },   // dratini > dragonair > dragonite, lv75
      { branch: [333, 334] },   // swablu > altaria, lv73
      { branch: [371, 372, 373] },   // bagon > shelgon > salamence, lv72
      { branch: [443, 444, 445] },   // gible > gabite > garchomp, lv72
      { branch: [129, 130] },   // magikarp > gyarados, lv68
      { branch: [4, 5, 6] },   // charmander > charmeleon > charizard, lv68
    ],
    tmMoveId: 434,
    powerup: { seat: 3, kind: 'mega', index: 0 },
  },
  {
    slot: 13,
    type: 'none',
    theme: 'Red\'s silent challenge',
    lines: [
      { branch: [172, 25, 26], pin: 25 },   // pichu > pikachu > raichu, lv88
      { branch: [1, 2, 3] },   // bulbasaur > ivysaur > venusaur, lv84
      { branch: [4, 5, 6] },   // charmander > charmeleon > charizard, lv84
      { branch: [7, 8, 9] },   // squirtle > wartortle > blastoise, lv84
      { branch: [446, 143] },   // munchlax > snorlax, lv82
      { branch: [131] },   // lapras, lv80
    ],
    tmMoveId: 34,
    powerup: { seat: 3, kind: 'dynamax', index: 0 },
    legend: [150, 6],
  },
];

export const KANTO_LEAGUE_NAME = 'Kanto League';

/**
 * One seeded line, with any pin applied.
 *
 * Pushing the stage below the pin past the last row is one `setBoundary`
 * call, which is what a downward drag on that stage does. Nothing else is
 * touched, so the rest of the line keeps the level curve's own rows.
 */
function seededLine(seed: SeedLine) {
  const line = makePlacedLine(seed.branch);
  if (seed.pin === undefined) return line;
  const stage = seed.branch.indexOf(seed.pin);
  if (stage < 0 || stage === seed.branch.length - 1) return line;
  return { ...line, boundaries: setBoundary(line, stage + 1, ROW_COUNT + 1) };
}

/** The member of a seeded line the leader fields: the pin, or the leaf. */
function aceId(seed: SeedLine | undefined): number | null {
  if (!seed) return null;
  return seed.pin ?? seed.branch[seed.branch.length - 1] ?? null;
}

/** The seeded cards, in slot order. */
/**
 * Slots the seed deliberately leaves empty.
 *
 * A template with every row filled never shows the other half of the league
 * home: the dashed type square, the plus, the row that says "add" rather than
 * "open". Judging a change to either state needs both on screen at once, so
 * two rows stay blank. They are one gym and one Elite Four member, the two
 * kinds that repeat, rather than two of a kind.
 *
 * The Kanto data for these slots stays in `SEED`. Filling a row again is
 * removing its number here, not typing a team back in.
 */
const BLANK_SLOTS = new Set([6, 9]);

export function kantoCards(): GymCard[] {
  const cards = Array.from({ length: SLOT_COUNT }, emptyCard);
  for (const seed of SEED) {
    if (BLANK_SLOTS.has(seed.slot)) continue;
    cards[seed.slot] = {
      type: seed.type,
      theme: seed.theme,
      lines: seed.lines.map(seededLine),
      // The ace carries the signature on every seeded card, marked on the
      // member the leader fields rather than on its line's leaf - the same
      // thing a tap on that Pokemon's tile in the picker records.
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
