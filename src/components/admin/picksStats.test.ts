import { describe, expect, it } from 'vitest';
import {
  formatIndex,
  indexBarPct,
  isOffSection,
  poolIdsForSection,
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

  it('never flags Other as off-section', () => {
    expect(isOffSection(MAGIKARP, 'other')).toBe(false);
  });
});

describe('index: Pichu dropped from a popular line', () => {
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
});

describe('Other Areas', () => {
  it('keeps a 1-pick species even when its × is below 1.10', () => {
    const view = sectionPicksView('other', [
      count(MAGIKARP, 100),
      count(GYARADOS, 1),
    ]);
    expect(view?.kind).toBe('plain');
    if (view?.kind !== 'plain') return;
    const gyarados = view.columns.most.find((l) => l.members.some((m) => m.id === GYARADOS));
    expect(gyarados?.picks).toBe(1);
    expect(gyarados!.index).toBeLessThan(1.1);
    expect(view.columns.most.map((l) => l.members[0].id)).toEqual([MAGIKARP, GYARADOS]);
  });
});
