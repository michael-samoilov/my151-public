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

const CHINCHOU = [170, 171];
const LOTAD = [270, 271, 272];
const WOOPER = [194, 195];
const MAGIKARP = [129, 130];
const LAPRAS = [131];
const CATERPIE = [10, 11, 12];
const RHYHORN = [111, 112, 464];

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
    expect(defaultBoundaries(CATERPIE)).toEqual([1, 1, 1]);
    const line = { branch: CATERPIE, boundaries: defaultBoundaries(CATERPIE) };
    expect(line.branch[stageAt(line, 1)]).toBe(12);
  });

  it('gives a later middle stage its own row instead of skipping it', () => {
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
    const line = { branch: LOTAD, boundaries: [1, 2, 6] };
    expect(setBoundary(line, 1, 4)).toEqual([1, 4, 6]);
    expect(setBoundary(line, 1, 8)).toEqual([1, 8, 8]);
    expect(setBoundary(line, 2, 1)).toEqual([1, 1, 1]);
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
  const onix = makePlacedLine([95, 208]);

  it('falls back once the pick leaves the line', () => {
    expect(signatureMember(onix, 74)).toBe(208);
  });
});

describe('visibleMembers', () => {
  it('cannot put all three stages of a line into seat 6', () => {
    const covered = { branch: [1, 2, 3], boundaries: [1, 1, 1] };
    expect(visibleMembers(covered, 6).length).toBeLessThan(3);
    expect(visibleMembers(covered, 6)).toEqual([3]);
  });

  it('shows at most two members in seat 6 when the user split the last two rows', () => {
    const split = { branch: [1, 2, 3], boundaries: [1, 10, 11] };
    expect(visibleMembers(split, 6)).toEqual([2, 3]);
  });
});
