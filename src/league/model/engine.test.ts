import { describe, expect, it } from 'vitest';
import { BOSS_ROW, CHAMPION_ROW } from './constants';
import {
  defaultBoundaries,
  deriveRow,
  makePlacedLine,
  setBoundary,
  signatureMember,
  stageAt,
  visibleMembers,
} from './engine';
import { arrivalLevel } from './impliedLevels';
import { getAllPokemon, getEvolutionLine, getPokemonById } from '@/hooks/usePokemonData';

// The demo roster the design boards were hand-verified against.
const CHINCHOU = [170, 171]; // Lanturn evolves at 27
const LOTAD = [270, 271, 272]; // 14, then Ludicolo by water stone (implied)
const WOOPER = [194, 195]; // Quagsire at 20
const MAGIKARP = [129, 130]; // Gyarados at 20
const LAPRAS = [131];
const CATERPIE = [10, 11, 12]; // all three evolve at or under level 12
const RHYHORN = [111, 112, 464]; // Rhydon at 42, Rhyperior traded (implied 38)

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
  it('collapses stages that would already be evolved by the first gym', () => {
    // Caterpie 7, Metapod 7, Butterfree 10 all sit under the first threshold
    // (12), so all three claim row 1 and the highest stage is the one drawn.
    expect(defaultBoundaries(CATERPIE)).toEqual([1, 1, 1]);
    const line = { branch: CATERPIE, boundaries: defaultBoundaries(CATERPIE) };
    expect(line.branch[stageAt(line, 1)]).toBe(12); // Butterfree
  });

  it('gives a later middle stage its own row instead of skipping it', () => {
    // Rhydon's real level is 42; Rhyperior has none, and BST implies 38.
    const rows = defaultBoundaries(RHYHORN);
    expect(rows).toEqual([1, 7, 8]);
    const line = { branch: RHYHORN, boundaries: rows };
    expect(line.branch[stageAt(line, 7)]).toBe(112);
    expect(line.branch[stageAt(line, 8)]).toBe(464);
  });

  it('leaves a well-spaced line alone', () => {
    expect(defaultBoundaries(CHINCHOU)).toEqual([1, 4]);
  });

  it('keeps every known automatic branch ordered and final by Champion', () => {
    const branches = new Map<string, number[]>();
    for (const pokemon of getAllPokemon()) {
      const branch = getEvolutionLine(pokemon.id).map((member) => member.id);
      branches.set(branch.join('-'), branch);
    }

    for (const branch of branches.values()) {
      const boundaries = defaultBoundaries(branch);
      const line = { branch, boundaries };
      expect(boundaries.every((row, stage) => stage === 0 || row >= boundaries[stage - 1])).toBe(true);
      expect(stageAt(line, CHAMPION_ROW)).toBe(branch.length - 1);
    }
  });
});

describe('boundaries and stages', () => {
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
});

describe('deriveRow', () => {
  const lines = [CHINCHOU, WOOPER, MAGIKARP, LAPRAS].map(makePlacedLine);

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

describe('signatureMember', () => {
  const onix = makePlacedLine([95, 208]); // Onix into Steelix

  it('falls back once the pick leaves the line', () => {
    expect(signatureMember(onix, 74)).toBe(208);
  });
});

describe('visibleMembers', () => {
  it('cannot put all three stages of a line into seat 6', () => {
    // Seat 6 only exists on rows 10–11. Even if every stage claims row 1,
    // those two rows still show the same final member.
    const covered = { branch: [1, 2, 3], boundaries: [1, 1, 1] };
    expect(visibleMembers(covered, 6).length).toBeLessThan(3);
    expect(visibleMembers(covered, 6)).toEqual([3]);
  });

  it('shows at most two members in seat 6 when the user split the last two rows', () => {
    const split = { branch: [1, 2, 3], boundaries: [1, 10, 11] };
    expect(visibleMembers(split, 6)).toEqual([2, 3]);
  });
});
