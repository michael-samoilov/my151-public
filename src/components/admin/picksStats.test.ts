import { describe, expect, it } from 'vitest';
import {
  formatIndex,
  isOffSection,
  lineKey,
  poolIdsForSection,
  rowsUsed,
  sectionPicksView,
  splitMostLeast,
  starterTypeOf,
} from './picksStats';

const PICHU = 172;
const PIKACHU = 25;
const RAICHU = 26;
const RHYHORN = 111;
const RHYDON = 112;
const RHYPERIOR = 464;
const MAGIKARP = 129;
const GYARADOS = 130;
const BULBASAUR = 1;
const IVYSAUR = 2;
const VENUSAUR = 3;
const CHARMANDER = 4;
const CHARMELEON = 5;
const CHARIZARD = 6;
const SQUIRTLE = 7;
const WARTORTLE = 8;
const BLASTOISE = 9;
const CHIKORITA = 152;
const CYNDAQUIL = 155;
const TOTODILE = 158;
const TREECKO = 252;
const TORCHIC = 255;
const MUDKIP = 258;
const TURTWIG = 387;
const CHIMCHAR = 390;
const PIPLUP = 393;
const SNIVY = 495;
const TEPIG = 498;
const OSHAWOTT = 501;

const count = (id: number, n: number): [string, number] => [String(id), n];

describe('lineKey', () => {
  it('puts Pichu, Pikachu, and Raichu on one line', () => {
    expect(lineKey(PICHU)).toBe(lineKey(PIKACHU));
    expect(lineKey(PIKACHU)).toBe(lineKey(RAICHU));
  });

  it('keeps Magikarp with Gyarados', () => {
    expect(lineKey(MAGIKARP)).toBe(lineKey(GYARADOS));
  });
});

describe('formatIndex', () => {
  it('prints one decimal below 10 and none at 10+', () => {
    expect(formatIndex(0)).toBe('0×');
    expect(formatIndex(1)).toBe('1.0×');
    expect(formatIndex(2.44)).toBe('2.4×');
    expect(formatIndex(12.4)).toBe('12×');
  });
});

describe('starterTypeOf', () => {
  it('groups by the base form grass / fire / water type', () => {
    expect(starterTypeOf(VENUSAUR)).toBe('grass');
    expect(starterTypeOf(CHARIZARD)).toBe('fire');
    expect(starterTypeOf(BLASTOISE)).toBe('water');
  });
});

describe('isOffSection / evil team', () => {
  it('does not flag Rhyhorn or Rhyperior in evil-team as off-section', () => {
    expect(isOffSection(RHYDON, 'evil-team')).toBe(false);
    expect(isOffSection(RHYHORN, 'evil-team')).toBe(false);
    expect(isOffSection(RHYPERIOR, 'evil-team')).toBe(false);
  });

  it('flags Magikarp in evil-team as off-section', () => {
    expect(isOffSection(MAGIKARP, 'evil-team')).toBe(true);
    expect(isOffSection(GYARADOS, 'evil-team')).toBe(true);
  });

  it('never flags Other as off-section', () => {
    expect(isOffSection(MAGIKARP, 'other')).toBe(false);
  });
});

describe('index: Pichu dropped from a popular line', () => {
  it('counts the line once at max(Pikachu, Raichu), not as an under-picked Pichu', () => {
    const view = sectionPicksView('pikachu-clone', [
      count(PICHU, 20),
      count(PIKACHU, 80),
      count(RAICHU, 78),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const line =
      view.columns.most.find((l) => l.members.some((m) => m.id === PIKACHU)) ??
      view.columns.least.find((l) => l.members.some((m) => m.id === PIKACHU));
    expect(line).toBeTruthy();
    expect(line?.picks).toBe(80);
    expect(line?.members.map((m) => m.id).sort((a, b) => a - b)).toEqual(
      [PICHU, PIKACHU, RAICHU].sort((a, b) => a - b),
    );
    const pichu = line?.members.find((m) => m.id === PICHU);
    expect(pichu?.picks).toBe(20);
    expect(view.columns.least.some((l) => l.members.length === 1 && l.members[0].id === PICHU)).toBe(
      false,
    );
  });

  it('is 2.0× when a line is picked twice the uniform rate among two lines', () => {
    const rows: [string, number][] = [
      count(PIKACHU, 80),
      count(RAICHU, 80),
      count(PICHU, 10),
      count(311, 40),
      count(312, 40),
    ];
    const view = sectionPicksView('pikachu-clone', rows);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const pika = [...view.columns.most, ...view.columns.least].find((l) =>
      l.members.some((m) => m.id === PIKACHU),
    );
    const plusle = [...view.columns.most, ...view.columns.least].find((l) =>
      l.members.some((m) => m.id === 311),
    );
    expect(pika).toBeTruthy();
    expect(plusle).toBeTruthy();
    // L includes every default pikaclone line, so the ratio is 80:40 between
    // these two, which is 2:1, even though the absolute × depends on L.
    expect(pika!.picks / plusle!.picks).toBe(2);
    expect(pika!.index / plusle!.index).toBeCloseTo(2);
    expect(pika!.index).toBeGreaterThan(plusle!.index);
  });
});

describe('splitMostLeast', () => {
  const line = (key: string, n: number) => ({
    key,
    members: Array.from({ length: n }, () => ({ length: 1 })),
  });

  it('fills most first, then least from the bottom, with no overlap', () => {
    const ranked = [line('a', 3), line('b', 3), line('c', 3), line('d', 3), line('e', 3), line('f', 3), line('g', 3), line('h', 3), line('i', 3), line('j', 3)];
    const { most, least } = splitMostLeast(ranked, { maxRows: 4, cols: 6 });
    const keys = new Set([...most, ...least].map((l) => l.key));
    expect(keys.size).toBe(most.length + least.length);
    expect(most.map((l) => l.key)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(least.map((l) => l.key)).toEqual(['j', 'i']);
  });

  it('splits a small set so least is not empty', () => {
    const ranked = [line('a', 3), line('b', 3)];
    const { most, least } = splitMostLeast(ranked, { maxRows: 4, cols: 6 });
    expect(most.map((l) => l.key)).toEqual(['a']);
    expect(least.map((l) => l.key)).toEqual(['b']);
  });

  it('caps starters at 4 lines per column', () => {
    const ranked = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((k) => line(k, 3));
    const { most, least } = splitMostLeast(ranked, { maxLines: 4 });
    expect(most).toHaveLength(4);
    expect(least).toHaveLength(4);
  });
});

describe('rowsUsed', () => {
  it('packs two 3-member lines onto one 6-wide row', () => {
    expect(rowsUsed([{ members: [0, 0, 0] }, { members: [0, 0, 0] }], 6)).toBe(1);
  });

  it('caps 8 three-member lines at 4 rows', () => {
    const lines = Array.from({ length: 8 }, () => ({ members: [0, 0, 0] }));
    expect(rowsUsed(lines, 6)).toBe(4);
  });
});

describe('sectionPicksView starters', () => {
  it('splits grass / fire / water and caps at 4 lines per type per column', () => {
    const rows: [string, number][] = [
      count(BULBASAUR, 90),
      count(IVYSAUR, 88),
      count(VENUSAUR, 85),
      count(CHIKORITA, 70),
      count(TREECKO, 55),
      count(TURTWIG, 40),
      count(SNIVY, 20),
      count(CHARMANDER, 80),
      count(CHARMELEON, 78),
      count(CHARIZARD, 76),
      count(CYNDAQUIL, 60),
      count(TORCHIC, 45),
      count(CHIMCHAR, 30),
      count(TEPIG, 12),
      count(SQUIRTLE, 50),
      count(WARTORTLE, 48),
      count(BLASTOISE, 47),
      count(TOTODILE, 35),
      count(MUDKIP, 22),
      count(PIPLUP, 10),
      count(OSHAWOTT, 4),
    ];
    const view = sectionPicksView('starter', rows);
    expect(view?.kind).toBe('starter');
    if (view?.kind !== 'starter') return;
    const types = view.groups.map((g) => g.type);
    expect(types).toEqual(expect.arrayContaining(['grass', 'fire', 'water']));
    for (const g of view.groups) {
      if (g.type === 'other') continue;
      expect(g.most.length).toBeLessThanOrEqual(4);
      expect(g.least.length).toBeLessThanOrEqual(4);
      expect(g.most.every((l) => l.starterType === g.type)).toBe(true);
    }
    const grass = view.groups.find((g) => g.type === 'grass');
    expect(grass?.most[0]?.members.some((m) => m.id === BULBASAUR || m.id === VENUSAUR)).toBe(true);
  });
});

describe('sectionPicksView off-section', () => {
  it('lists Magikarp in evil-team and omits Rhyhorn', () => {
    const view = sectionPicksView(
      'evil-team',
      [count(RHYDON, 40), count(RHYHORN, 12), count(RHYPERIOR, 8), count(MAGIKARP, 15), count(GYARADOS, 6)],
      { offSection: true },
    );
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const ids = [...view.columns.most, ...view.columns.least].flatMap((l) => l.members.map((m) => m.id));
    expect(ids).toContain(MAGIKARP);
    expect(ids).not.toContain(RHYHORN);
    expect(ids).not.toContain(RHYDON);
    expect(ids).not.toContain(RHYPERIOR);
  });
});

describe('poolIdsForSection', () => {
  it('includes Rhyhorn in the evil-team pool after chain expansion', () => {
    const pool = poolIdsForSection('evil-team');
    expect(pool).toContain(RHYDON);
    expect(pool).toContain(RHYHORN);
    expect(pool).toContain(RHYPERIOR);
    expect(pool).not.toContain(MAGIKARP);
  });
});
