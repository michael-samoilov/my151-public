import { describe, expect, it } from 'vitest';
import { venn } from 'venn.js';
import { areasFromRegions, layoutCircles, placeCircleLabels, placeRegionLabels } from './vennAreas';

const catalog = [
  { id: 'dex', label: 'Dex builder', short: 'Dex', launchedAt: 0 },
  { id: 'league', label: 'Gym leader maker', short: 'League', launchedAt: 1 },
];

describe('areasFromRegions', () => {
  it('turns exclusive regions into inclusive set sizes plus pairwise overlap', () => {
    expect(areasFromRegions({ dex: 10, league: 1, 'dex+league': 3 }, catalog)).toEqual([
      { sets: ['Dex'], size: 13 },
      { sets: ['League'], size: 4 },
      { sets: ['Dex', 'League'], size: 3 },
    ]);
  });

  it('drops a tool that has no members in this era', () => {
    expect(areasFromRegions({ dex: 20 }, catalog)).toEqual([{ sets: ['Dex'], size: 20 }]);
  });
});

describe('venn.js layout', () => {
  it('gives the larger set a larger radius', () => {
    const circles = venn([
      { sets: ['Dex'], size: 336 },
      { sets: ['League'], size: 3 },
      { sets: ['Dex', 'League'], size: 3 },
    ]);
    expect(circles.Dex.radius).toBeGreaterThan(circles.League.radius * 3);
  });
});

describe('placeRegionLabels', () => {
  const box = { w: 168, h: 148 };

  it('puts exclusive and both counts on the pre-launch speck Venn', () => {
    const regions = { dex: 336, 'dex+league': 3 };
    const circles = layoutCircles(areasFromRegions(regions, catalog), box.w, box.h);
    const labels = placeRegionLabels(regions, catalog, circles, box.w, box.h);
    const byKey = Object.fromEntries(labels.map((l) => [l.key, l]));
    expect(byKey.dex.count).toBe(336);
    expect(byKey['dex+league'].count).toBe(3);
    expect(byKey.league).toBeUndefined();
    for (const l of labels) {
      expect(l.x).toBeGreaterThanOrEqual(8);
      expect(l.x).toBeLessThanOrEqual(box.w - 8);
      expect(l.y).toBeGreaterThanOrEqual(8);
      expect(l.y).toBeLessThanOrEqual(box.h - 8);
    }
    const both = byKey['dex+league'];
    expect(both.hitR).toBeGreaterThanOrEqual(12);
    if (circles.League.radius < 14) {
      expect(both.placement).toBe('outside');
    }
  });

  it('labels all three exclusive regions after launch', () => {
    const regions = { dex: 48, league: 1, 'dex+league': 1 };
    const circles = layoutCircles(areasFromRegions(regions, catalog), box.w, box.h);
    const labels = placeRegionLabels(regions, catalog, circles, box.w, box.h);
    expect(labels.map((l) => l.key).sort()).toEqual(['dex', 'dex+league', 'league']);
    expect(labels.every((l) => l.count > 0)).toBe(true);
  });

  it('lays out three tools without dropping a set', () => {
    const three = [
      ...catalog,
      { id: 'fav', label: 'Favourites', short: 'Fav', launchedAt: 2 },
    ];
    const regions = {
      dex: 10,
      league: 4,
      fav: 3,
      'dex+league': 5,
      'dex+fav': 2,
      'league+fav': 1,
      'dex+league+fav': 2,
    };
    const areas = areasFromRegions(regions, three);
    expect(areas.some((a) => a.sets.length === 3)).toBe(true);
    const circles = layoutCircles(areas, 240, 200);
    expect(Object.keys(circles).sort()).toEqual(['Dex', 'Fav', 'League']);
    const labels = placeRegionLabels(regions, three, circles, 240, 200);
    expect(labels.some((l) => l.key === 'dex')).toBe(true);
    expect(labels.some((l) => l.key === 'fav')).toBe(true);
  });
});

describe('placeCircleLabels', () => {
  const box = { w: 358, h: 186 };

  it('parks each inclusive label on the outer side of its circle', () => {
    const regions = { dex: 23, league: 14, 'dex+league': 8 };
    const circles = layoutCircles(areasFromRegions(regions, catalog), box.w, box.h, 28);
    const labels = placeCircleLabels(regions, catalog, circles, box.w, box.h);
    const byId = Object.fromEntries(labels.map((l) => [l.id, l]));
    expect(byId.dex).toMatchObject({ short: 'Dex', count: 31, anchor: 'end' });
    expect(byId.league).toMatchObject({ short: 'League', count: 22, anchor: 'start' });
    expect(byId.dex.x).toBeLessThan(circles.Dex.x);
    expect(byId.league.x).toBeGreaterThan(circles.League.x);
    for (const l of labels) {
      const c = circles[l.short];
      expect(Math.hypot(l.x - c.x, l.y - c.y)).toBeGreaterThan(c.radius);
    }
  });

  it('labels all three circles on a three-tool Venn', () => {
    const three = [
      ...catalog,
      { id: 'fav', label: 'Favourites', short: 'Fav', launchedAt: 2 },
    ];
    const regions = {
      dex: 10,
      league: 4,
      fav: 3,
      'dex+league': 5,
      'dex+fav': 2,
      'league+fav': 1,
      'dex+league+fav': 2,
    };
    const circles = layoutCircles(areasFromRegions(regions, three), 240, 200, 28);
    const labels = placeCircleLabels(regions, three, circles, 240, 200);
    expect(labels.map((l) => l.id).sort()).toEqual(['dex', 'fav', 'league']);
  });
});
