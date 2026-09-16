import { describe, expect, it } from 'vitest';
import {
  BOSS_ROW,
  LEVEL_CURVE,
  TEAM_SIZES,
  joinRow,
  slotKind,
  slotLabel,
  slotRow,
} from './constants';
import {
  defaultBoundaries,
  deriveRow,
  deriveRows,
  makePlacedLine,
  moveLeagueSlots,
  moveSeat,
  setBoundary,
  signatureMember,
  stageAt,
} from './engine';
import { arrivalLevel } from './impliedLevels';
import { getPokemonById } from '@/hooks/usePokemonData';

// The demo roster the design boards were hand-verified against.
const CHINCHOU = [170, 171]; // Lanturn evolves at 27
const LOTAD = [270, 271, 272]; // 14, then Ludicolo by water stone (implied)
const WOOPER = [194, 195]; // Quagsire at 20
const MAGIKARP = [129, 130]; // Gyarados at 20
const LAPRAS = [131];
const CATERPIE = [10, 11, 12]; // all three evolve at or under level 12
const RHYHORN = [111, 112, 464]; // Rhydon at 42, Rhyperior traded (implied 38)

describe('constants', () => {
  it('joins each seat at the first row big enough for it', () => {
    expect(joinRow(1)).toBe(1);
    expect(joinRow(2)).toBe(1);
    expect(joinRow(3)).toBe(2);
    expect(joinRow(4)).toBe(5);
    expect(joinRow(5)).toBe(8);
    expect(joinRow(6)).toBe(10);
  });

  it('maps league slots onto card rows', () => {
    expect(slotRow(0)).toBe(1);
    expect(slotRow(7)).toBe(8);
    expect(slotRow(8)).toBe(9);
    expect(slotRow(11)).toBe(9); // all Elite Four show the same row
    expect(slotRow(12)).toBe(10);
    expect(slotRow(13)).toBe(11);
    expect(slotKind(13)).toBe('boss');
    expect(slotLabel(9)).toBe('Elite Four 2');
  });

  it('keeps the curve and sizes in the settled shape', () => {
    expect(TEAM_SIZES).toHaveLength(11);
    expect(LEVEL_CURVE).toHaveLength(11);
  });
});

describe('arrivalLevel', () => {
  it('returns 0 for base forms and the real level when one exists', () => {
    expect(arrivalLevel(getPokemonById(170)!)).toBe(0);
    expect(arrivalLevel(getPokemonById(171)!)).toBe(27);
    expect(arrivalLevel(getPokemonById(130)!)).toBe(20);
  });

  it('implies a plausible level for level-less evolvers', () => {
    const ludicolo = getPokemonById(272)!;
    expect(ludicolo.evolutionLevel).toBeNull();
    const implied = arrivalLevel(ludicolo);
    expect(implied).toBeGreaterThan(20);
    expect(implied).toBeLessThan(60);
  });
});

describe('defaultBoundaries', () => {
  it('lets the curve skip a member rather than making room for it', () => {
    // Caterpie 7, Metapod 7, Butterfree 10 all sit under the first threshold
    // (12), so all three claim row 1 and the highest stage is the one drawn.
    // The shelf handle is what recovers the other two.
    expect(defaultBoundaries(CATERPIE)).toEqual([1, 1, 1]);
    const line = { branch: CATERPIE, boundaries: defaultBoundaries(CATERPIE) };
    expect(line.branch[stageAt(line, 1)]).toBe(12); // Butterfree
  });

  it('lets an implied level land under the stage below it', () => {
    // Rhydon's real level is 42; Rhyperior has none, and BST implies 38.
    const rows = defaultBoundaries(RHYHORN);
    expect(rows[2]).toBeLessThan(rows[1]);
  });

  it('leaves a well-spaced line alone', () => {
    expect(defaultBoundaries(CHINCHOU)).toEqual([1, 4]);
  });
});

describe('boundaries and stages', () => {
  it('derives boundaries from the curve', () => {
    const line = makePlacedLine(CHINCHOU);
    // Lanturn at 27 first fits row 4 (threshold 32).
    expect(line.boundaries).toEqual([1, 4]);
    expect(stageAt(line, 3)).toBe(0);
    expect(stageAt(line, 4)).toBe(1);
  });

  it('sets a boundary and pushes neighbours instead of clamping into them', () => {
    // Hand-built boundaries so the assertions don't depend on the regression.
    const line = { branch: LOTAD, boundaries: [1, 2, 6] };
    // A plain move inside the neighbours changes only its own stage.
    expect(setBoundary(line, 1, 4)).toEqual([1, 4, 6]);
    // Moving a stage down through its evolution pushes that boundary along —
    // the shelf covers the later stage rather than stopping at it.
    expect(setBoundary(line, 1, 8)).toEqual([1, 8, 8]);
    // Moving a stage up through its pre-evolution pulls that boundary up.
    expect(setBoundary(line, 2, 1)).toEqual([1, 1, 1]);
    // Stage 0 is pinned.
    expect(setBoundary(line, 0, 9)).toEqual(line.boundaries);
  });

  it('keeps covered stages recoverable from the visible run', () => {
    // Ludicolo dragged to the top squeezed both earlier stages out.
    const covered = { branch: LOTAD, boundaries: [1, 1, 1] };
    expect(stageAt(covered, 1)).toBe(2);
    // Its top handle dragged down reveals Lombre above it…
    const step1 = setBoundary(covered, 2, 5);
    expect(step1).toEqual([1, 1, 5]);
    expect(stageAt({ ...covered, boundaries: step1 }, 3)).toBe(1);
    // …and Lombre's top handle dragged down reveals Lotad.
    const step2 = setBoundary({ ...covered, boundaries: step1 }, 1, 3);
    expect(step2).toEqual([1, 3, 5]);
    expect(stageAt({ ...covered, boundaries: step2 }, 2)).toBe(0);
  });
});

describe('deriveRow', () => {
  const lines = [CHINCHOU, WOOPER, MAGIKARP, LAPRAS].map(makePlacedLine);

  it('always emits every seat the row allows, filled or not', () => {
    const row1 = deriveRow(lines.slice(0, 1), 1, []);
    expect(row1).toHaveLength(2);
    expect(row1[0]).toMatchObject({ seat: 2, pokemonId: null });
    expect(row1[1]).toMatchObject({ seat: 1, pokemonId: 170 });
  });

  it('joins seats at their row and evolves along the curve', () => {
    // Row 1 seats two: Wooper and Chinchou, unevolved.
    const row1 = deriveRow(lines, 1, []);
    expect(row1.map((c) => c.pokemonId)).toEqual([194, 170]);
    // Left to right at row 5: Lapras (seat 4 joins here), Gyarados,
    // Quagsire (20 ≤ 34), Lanturn (27 ≤ 34).
    const row5 = deriveRow(lines, 5, []);
    expect(row5.map((c) => c.pokemonId)).toEqual([131, 130, 195, 171]);
  });

  it('overlays the legendary on the boss row only', () => {
    const legends = [{ pokemonId: 245, seat: 3 }];
    const boss = deriveRow(lines, BOSS_ROW, legends);
    const seat3 = boss.find((c) => c.seat === 3)!;
    expect(seat3).toMatchObject({ pokemonId: 245, isLegend: true });
    const champ = deriveRow(lines, 10, legends);
    expect(champ.find((c) => c.seat === 3)!.pokemonId).toBe(130); // untouched
    expect(deriveRows(lines, legends)).toHaveLength(11);
  });

  it('overlays one legendary per seat, so the row can be all of them', () => {
    const legends = [
      { pokemonId: 245, seat: 1 },
      { pokemonId: 243, seat: 2 },
      { pokemonId: 244, seat: 3 },
    ];
    const boss = deriveRow(lines, BOSS_ROW, legends);
    for (const { pokemonId, seat } of legends) {
      expect(boss.find((c) => c.seat === seat)).toMatchObject({ pokemonId, isLegend: true });
    }
  });
});

describe('moveSeat', () => {
  it('removes and reinserts, closing the rest up', () => {
    expect(moveSeat(['a', 'b', 'c', 'd'], 1, 3)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveSeat(['a', 'b', 'c', 'd'], 4, 1)).toEqual(['d', 'a', 'b', 'c']);
  });
});

describe('signatureMember', () => {
  const onix = makePlacedLine([95, 208]); // Onix into Steelix
  const geodude = makePlacedLine([74, 75, 76]);

  it('shows the pokemon the user picked', () => {
    expect(signatureMember(geodude, 74)).toBe(74);
    expect(signatureMember(geodude, 75)).toBe(75);
  });

  it('shows the picked pre-evolution over the line leaf', () => {
    expect(stageAt(onix, BOSS_ROW)).toBe(1); // the boss row fields Steelix
    expect(signatureMember(onix, 95)).toBe(95);
  });

  it('falls back to the boss row with no pick', () => {
    expect(signatureMember(onix, null)).toBe(208);
    expect(signatureMember(geodude, null)).toBe(76);
  });

  it('falls back once the pick leaves the line', () => {
    expect(signatureMember(onix, 74)).toBe(208);
  });

  it('has nothing to show without a line', () => {
    expect(signatureMember(undefined, 74)).toBeNull();
  });
});

describe('moveLeagueSlots', () => {
  const empty = '';
  const isEmpty = (s: string) => s === empty;
  const blank = () => empty;
  const slots = () => Array.from({ length: 14 }, () => empty);
  const fill = (...pairs: Array<[number, string]>) => {
    const start = slots();
    for (const [i, name] of pairs) start[i] = name;
    return start;
  };

  it('moves into an empty row and leaves every other trainer', () => {
    const start = fill([8, 'e4-1'], [9, 'e4-2'], [10, 'e4-3'], [11, 'e4-4']);
    const next = moveLeagueSlots(start, 11, 7, isEmpty, blank);
    expect(next).toEqual(fill([7, 'e4-4'], [8, 'e4-1'], [9, 'e4-2'], [10, 'e4-3']));
  });

  it('swaps adjacent occupied rows downward', () => {
    const start = fill([5, 'a'], [6, 'b'], [7, 'c']);
    const next = moveLeagueSlots(start, 5, 6, isEmpty, blank);
    expect(next).toEqual(fill([5, 'b'], [6, 'a'], [7, 'c']));
  });

  it('swaps adjacent occupied rows upward', () => {
    const start = fill([5, 'a'], [6, 'b'], [7, 'c']);
    const next = moveLeagueSlots(start, 6, 5, isEmpty, blank);
    expect(next).toEqual(fill([5, 'b'], [6, 'a'], [7, 'c']));
  });

  it('swaps distant occupied rows and leaves the rows between them', () => {
    const start = fill([3, 'a'], [4, 'b'], [5, 'c'], [8, 'd']);
    const next = moveLeagueSlots(start, 3, 8, isEmpty, blank);
    expect(next).toEqual(fill([3, 'd'], [4, 'b'], [5, 'c'], [8, 'a']));
  });

  it('swaps with the last occupied row and does not wrap it into the hole', () => {
    const start = fill([0, 'first'], [12, 'champ'], [13, 'boss']);
    const next = moveLeagueSlots(start, 0, 13, isEmpty, blank);
    expect(next).toEqual(fill([0, 'boss'], [12, 'champ'], [13, 'first']));
  });

  it('does not wrap the last row into the pickup hole when swapping with a middle row', () => {
    const start = fill([0, 'first'], [12, 'champ'], [13, 'boss']);
    const next = moveLeagueSlots(start, 0, 12, isEmpty, blank);
    expect(next).toEqual(fill([0, 'champ'], [12, 'first'], [13, 'boss']));
  });

  it('leaves the list unchanged when the pickup row is empty', () => {
    const start = fill([5, 'a']);
    expect(moveLeagueSlots(start, 6, 5, isEmpty, blank)).toEqual(start);
  });

  it('does nothing when dropped on itself', () => {
    const start = fill([4, 'a'], [5, 'b']);
    expect(moveLeagueSlots(start, 4, 4, isEmpty, blank)).toEqual(start);
  });

  it('swaps across gym and elite-four slots', () => {
    const start = fill([7, 'gym8'], [8, 'e4-1'], [9, 'e4-2']);
    const next = moveLeagueSlots(start, 7, 8, isEmpty, blank);
    expect(next).toEqual(fill([7, 'e4-1'], [8, 'gym8'], [9, 'e4-2']));
  });

  it('moves across sections into an empty elite-four slot', () => {
    const start = fill([7, 'gym8'], [9, 'e4-2']);
    const next = moveLeagueSlots(start, 7, 8, isEmpty, blank);
    expect(next).toEqual(fill([8, 'gym8'], [9, 'e4-2']));
  });
});
