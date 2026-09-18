import { describe, expect, it } from 'vitest';
import {
  PICKS_GRID_CAP,
  formatIndex,
  indexBarPct,
  isOffSection,
  lineKey,
  picksGridCap,
  picksGridCols,
  picksSplitCap,
  picksStarterCols,
  starterGenerationCount,
  poolIdsForSection,
  rowsUsed,
  sectionPicksView,
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
const TYPHLOSION = 157;
const HISUIAN_TYPHLOSION = 10233;
const LITWICK = 607;
const LAMPENT = 608;
const CHANDELURE = 609;
const APPLIN = 840;
const DIPPLIN = 1011;
const HYDRAPPLE = 1019;

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
    expect(formatIndex(0.84)).toBe('0.8×');
    expect(formatIndex(0.86)).toBe('0.9×');
    expect(formatIndex(1)).toBe('1.0×');
    expect(formatIndex(2.44)).toBe('2.4×');
    expect(formatIndex(12.4)).toBe('12×');
  });
});

describe('indexBarPct', () => {
  it('scales to the pair max and leaves 0× empty', () => {
    expect(indexBarPct(0, 2)).toBe(0);
    expect(indexBarPct(1, 2)).toBe(50);
    expect(indexBarPct(2, 2)).toBe(100);
    expect(indexBarPct(4, 2)).toBe(100);
    expect(indexBarPct(1, 0)).toBe(0);
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
  it('ranks Pichu as its own species, not on Pikachu\'s line', () => {
    const view = sectionPicksView('pikachu-clone', [
      count(PICHU, 20),
      count(PIKACHU, 80),
      count(RAICHU, 78),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const all = [...view.columns.most, ...view.columns.least];
    const pikaLine = all.find((l) => l.members.some((m) => m.id === PIKACHU));
    const pichuLine = all.find((l) => l.members.some((m) => m.id === PICHU));
    expect(pikaLine?.picks).toBe(80);
    expect(pikaLine?.members.map((m) => m.id)).toEqual([PIKACHU]);
    expect(pichuLine?.picks).toBe(20);
    expect(pichuLine?.members.map((m) => m.id)).toEqual([PICHU]);
    expect(pichuLine?.key).not.toBe(pikaLine?.key);
    expect(pichuLine!.index).toBeLessThan(pikaLine!.index);
  });

  it('indexes Pichu below Pikachu when Pichu has fewer picks', () => {
    const view = sectionPicksView('pikachu-clone', [
      count(PICHU, 94),
      count(PIKACHU, 109),
      count(RAICHU, 108),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const all = [...view.columns.most, ...view.columns.least];
    const pichu = all.find((l) => l.members.some((m) => m.id === PICHU));
    const pikachu = all.find((l) => l.members.some((m) => m.id === PIKACHU));
    const raichu = all.find((l) => l.members.some((m) => m.id === RAICHU));
    expect(pichu?.members.map((m) => m.id)).toEqual([PICHU]);
    expect(pikachu?.members.map((m) => m.id)).toEqual([PIKACHU]);
    expect(raichu?.members.map((m) => m.id)).toEqual([RAICHU]);
    expect(pichu!.index).toBeLessThan(pikachu!.index);
    expect(pichu!.index / pikachu!.index).toBeCloseTo(94 / 109);
    expect(raichu!.index / pikachu!.index).toBeCloseTo(108 / 109);
    expect(formatIndex(pichu!.index)).not.toBe(formatIndex(pikachu!.index));
  });

  it('orders Most picked by each species own × so Pikachu sits before Pichu', () => {
    const view = sectionPicksView('pikachu-clone', [
      count(PICHU, 85),
      count(PIKACHU, 100),
      count(RAICHU, 100),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const mostIds = view.columns.most.flatMap((l) => l.members.map((m) => m.id));
    const pika = mostIds.indexOf(PIKACHU);
    const raichu = mostIds.indexOf(RAICHU);
    const pichu = mostIds.indexOf(PICHU);
    expect(pika).toBeGreaterThanOrEqual(0);
    expect(raichu).toBeGreaterThanOrEqual(0);
    expect(pichu).toBeGreaterThanOrEqual(0);
    expect(pika).toBeLessThan(pichu);
    expect(raichu).toBeLessThan(pichu);
    const pikaLine = view.columns.most.find((l) => l.members.some((m) => m.id === PIKACHU));
    const pichuLine = view.columns.most.find((l) => l.members.some((m) => m.id === PICHU));
    expect(pikaLine?.members.map((m) => m.id)).toEqual([PIKACHU]);
    expect(pichuLine?.members.map((m) => m.id)).toEqual([PICHU]);
    expect(pikaLine?.key).not.toBe(pichuLine?.key);
  });

  it('lists every default Pikaclone species in one grid, including Pichu and 0×', () => {
    const view = sectionPicksView('pikachu-clone', [
      count(PICHU, 85),
      count(PIKACHU, 100),
      count(RAICHU, 100),
      count(MAGIKARP, 50),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    expect(view.columns.least).toEqual([]);
    const mostIds = view.columns.most.flatMap((l) => l.members.map((m) => m.id));
    const pool = [...poolIdsForSection('pikachu-clone')];
    expect(mostIds).toHaveLength(pool.length);
    expect(new Set(mostIds)).toEqual(new Set(pool));
    expect(mostIds).toContain(PICHU);
    expect(mostIds).toContain(PIKACHU);
    expect(mostIds).not.toContain(MAGIKARP);
    expect(mostIds.indexOf(PIKACHU)).toBeLessThan(mostIds.indexOf(PICHU));
    expect(view.columns.most.every((l) => l.members.length === 1)).toBe(true);
    const last = view.columns.most.at(-1);
    expect(last?.index).toBe(0);
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
    // These two species sit at 80 vs 40 against the same T/N, so the ratio is 2:1.
    expect(pika!.picks / plusle!.picks).toBe(2);
    expect(pika!.index / plusle!.index).toBeCloseTo(2);
    expect(pika!.index).toBeGreaterThan(plusle!.index);
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

  it('packs four 3-member lines onto one 12-wide row', () => {
    expect(
      rowsUsed(
        [{ members: [0, 0, 0] }, { members: [0, 0, 0] }, { members: [0, 0, 0] }, { members: [0, 0, 0] }],
        12,
      ),
    ).toBe(1);
  });

  it('packs nine first-stage faces onto one 12-col row', () => {
    const lines = Array.from({ length: 9 }, () => ({ members: [0] }));
    expect(rowsUsed(lines, 6)).toBe(2);
    expect(rowsUsed(lines, 12)).toBe(1);
  });

  it('packs three 4-member lines onto two 6-wide rows by splitting lines', () => {
    const lines = Array.from({ length: 3 }, () => ({ members: [0, 0, 0, 0] }));
    expect(rowsUsed(lines, 6)).toBe(2);
  });
});

describe('starterGenerationCount', () => {
  it('matches Generation subgroups in the Starter category', () => {
    expect(starterGenerationCount()).toBe(9);
    expect(picksStarterCols()).toBe(9);
  });
});

describe('picksGridCols', () => {
  it('uses 9 columns for Most picked and off-section on phone and desktop', () => {
    expect(picksGridCols(false, true)).toBe(6);
    expect(picksGridCols(true, false)).toBe(9);
    expect(picksGridCols(true, true)).toBe(9);
    expect(picksStarterCols()).toBe(9);
    expect(picksGridCap(true, true)).toEqual({ maxRows: Number.POSITIVE_INFINITY, cols: 9 });
    expect(picksGridCap(true, false)).toEqual({ maxRows: Number.POSITIVE_INFINITY, cols: 9 });
    expect(picksGridCap(false, true)).toEqual({ maxRows: Number.POSITIVE_INFINITY, cols: 9 });
  });
});

describe('picksSplitCap', () => {
  it('uses one uncapped 9-column grid on Most picked and off-section', () => {
    expect(picksSplitCap(false, true)).toEqual({
      kind: 'single',
      cap: { maxRows: Number.POSITIVE_INFINITY, cols: 9 },
    });
    expect(picksSplitCap(false, false)).toEqual({
      kind: 'single',
      cap: { maxRows: Number.POSITIVE_INFINITY, cols: 9 },
    });
    expect(picksSplitCap(true, true)).toEqual({
      kind: 'single',
      cap: { maxRows: Number.POSITIVE_INFINITY, cols: 9 },
    });
  });
});

describe('sectionPicksView starters', () => {
  it('lists every first-stage across grass / fire / water with no least column', () => {
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
      expect(g.least).toEqual([]);
      expect(g.most.every((l) => l.starterType === g.type)).toBe(true);
      for (const line of g.most) {
        expect(line.members).toHaveLength(1);
      }
    }
    const grass = view.groups.find((g) => g.type === 'grass');
    expect(grass?.most[0]?.members.map((m) => m.id)).toEqual([BULBASAUR]);
    expect(grass?.most[0]?.picks).toBe(90);
    expect(grass?.most.some((l) => l.members.some((m) => m.id === VENUSAUR || m.id === IVYSAUR))).toBe(
      false,
    );
    expect(grass?.most.some((l) => l.members[0]?.id === SNIVY)).toBe(true);
  });

  it('groups Hisuian Typhlosion onto Cyndaquil at max picks', () => {
    const view = sectionPicksView('starter', [
      count(CYNDAQUIL, 60),
      count(TYPHLOSION, 10),
      count(HISUIAN_TYPHLOSION, 80),
      count(CHARMANDER, 20),
    ]);
    expect(view?.kind).toBe('starter');
    if (view?.kind !== 'starter') return;
    const fire = view.groups.find((g) => g.type === 'fire');
    const bars = [...(fire?.most ?? []), ...(fire?.least ?? [])];
    const cyndaquil = bars.filter((l) => l.members.some((m) => m.id === CYNDAQUIL));
    expect(cyndaquil).toHaveLength(1);
    expect(cyndaquil[0].members.map((m) => m.id)).toEqual([CYNDAQUIL]);
    expect(cyndaquil[0].picks).toBe(80);
    expect(bars.some((l) => l.members.some((m) => m.id === HISUIAN_TYPHLOSION || m.id === TYPHLOSION))).toBe(
      false,
    );
  });
});

describe('sectionPicksView off-section', () => {
  it('keeps off-section starters as one list with every placed stage', () => {
    const view = sectionPicksView(
      'starter',
      [
        count(BULBASAUR, 90),
        count(IVYSAUR, 88),
        count(VENUSAUR, 85),
        count(MAGIKARP, 5),
        count(GYARADOS, 3),
        count(LITWICK, 4),
        count(LAMPENT, 2),
        count(CHANDELURE, 1),
        count(APPLIN, 3),
        count(DIPPLIN, 2),
        count(HYDRAPPLE, 1),
      ],
      { offSection: true },
    );
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    expect(view.columns.least).toEqual([]);
    const ids = view.columns.most.flatMap((l) => l.members.map((m) => m.id));
    expect(ids).not.toContain(BULBASAUR);
    expect(ids).not.toContain(IVYSAUR);
    expect(ids).not.toContain(VENUSAUR);
    const magikarp = view.columns.most.find((l) => l.members.some((m) => m.id === MAGIKARP));
    expect(magikarp?.members.map((m) => m.id)).toEqual([MAGIKARP]);
    const gyarados = view.columns.most.find((l) => l.members.some((m) => m.id === GYARADOS));
    expect(gyarados?.members.map((m) => m.id)).toEqual([GYARADOS]);
    const mostIds = view.columns.most.flatMap((l) => l.members.map((m) => m.id));
    expect(mostIds.indexOf(MAGIKARP)).toBeLessThan(mostIds.indexOf(GYARADOS));
    const litwick = view.columns.most.find((l) => l.members.some((m) => m.id === LITWICK));
    expect(litwick?.members.map((m) => m.id)).toEqual([LITWICK]);
    expect(view.columns.most.find((l) => l.members.some((m) => m.id === LAMPENT))?.members.map((m) => m.id)).toEqual(
      [LAMPENT],
    );
    expect(
      view.columns.most.find((l) => l.members.some((m) => m.id === CHANDELURE))?.members.map((m) => m.id),
    ).toEqual([CHANDELURE]);
    const applin = view.columns.most.find((l) => l.members.some((m) => m.id === APPLIN));
    expect(applin?.members.map((m) => m.id)).toEqual([APPLIN]);
    expect(view.columns.most.find((l) => l.members.some((m) => m.id === DIPPLIN))?.members.map((m) => m.id)).toEqual(
      [DIPPLIN],
    );
    expect(
      view.columns.most.find((l) => l.members.some((m) => m.id === HYDRAPPLE))?.members.map((m) => m.id),
    ).toEqual([HYDRAPPLE]);
  });

  it('keeps n=1 off-section lines unless excludeOneOffs is on', () => {
    const rows: [string, number][] = [count(MAGIKARP, 15), count(CHARMANDER, 1), count(BULBASAUR, 4)];
    const shown = sectionPicksView('evil-team', rows, { offSection: true, cap: PICKS_GRID_CAP });
    expect(shown?.kind).toBe('plain');
    if (shown?.kind !== 'plain') return;
    const shownIds = shown.columns.most.flatMap((l) => l.members.map((m) => m.id));
    expect(shownIds).toContain(CHARMANDER);
    expect(shownIds).toContain(MAGIKARP);
    expect(shownIds).toContain(BULBASAUR);

    const hidden = sectionPicksView('evil-team', rows, {
      offSection: true,
      excludeOneOffs: true,
      cap: PICKS_GRID_CAP,
    });
    expect(hidden?.kind).toBe('plain');
    if (hidden?.kind !== 'plain') return;
    const hiddenIds = hidden.columns.most.flatMap((l) => l.members.map((m) => m.id));
    expect(hiddenIds).not.toContain(CHARMANDER);
    expect(hiddenIds).toContain(MAGIKARP);
    expect(hiddenIds).toContain(BULBASAUR);
  });

  it('does not drop off-section lines after four rows', () => {
    const rows: [string, number][] = Array.from({ length: 40 }, (_, i) => count(i + 1, 1));
    const view = sectionPicksView('evil-team', rows, { offSection: true, cap: PICKS_GRID_CAP });
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const tiles = view.columns.most.reduce((n, l) => n + l.members.length, 0);
    expect(tiles).toBeGreaterThan(PICKS_GRID_CAP.maxRows * PICKS_GRID_CAP.cols);
  });

  it('lists Magikarp in evil-team and omits Rhyhorn', () => {
    const view = sectionPicksView(
      'evil-team',
      [count(RHYDON, 40), count(RHYHORN, 12), count(RHYPERIOR, 8), count(MAGIKARP, 15), count(GYARADOS, 6)],
      { offSection: true },
    );
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    expect(view.columns.least).toEqual([]);
    const magikarp = view.columns.most.find((l) => l.members.some((m) => m.id === MAGIKARP));
    expect(magikarp?.picks).toBe(15);
    expect(magikarp?.members.map((m) => m.id)).toEqual([MAGIKARP]);
    const gyarados = view.columns.most.find((l) => l.members.some((m) => m.id === GYARADOS));
    expect(gyarados?.picks).toBe(6);
    expect(gyarados?.members.map((m) => m.id)).toEqual([GYARADOS]);
    const ids = view.columns.most.flatMap((l) => l.members.map((m) => m.id));
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
