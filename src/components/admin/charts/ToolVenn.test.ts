import { describe, expect, it } from 'vitest';
import {
  areasFromRegions,
  CIRCLE_LABEL_GAP,
  layoutCircles,
  placeCircleLabels,
  placeRegionLabels,
} from './vennAreas';

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
});

describe('placeCircleLabels', () => {
  const box = { w: 358, h: 186 };

  it('parks each inclusive label on the outer side of its circle', () => {
    const regions = { dex: 23, league: 14, 'dex+league': 8 };
    const circles = layoutCircles(areasFromRegions(regions, catalog), box.w, box.h, 12);
    const labels = placeCircleLabels(regions, catalog, circles);
    const byId = Object.fromEntries(labels.map((l) => [l.id, l]));
    expect(byId.dex).toMatchObject({ short: 'Dex', count: 31, anchor: 'end' });
    expect(byId.league).toMatchObject({ short: 'League', count: 22, anchor: 'start' });
    expect(byId.dex.x).toBeLessThan(circles.Dex.x);
    expect(byId.league.x).toBeGreaterThan(circles.League.x);
    for (const l of labels) {
      const c = circles[l.short];
      const reach = Math.hypot(l.x - c.x, l.y - c.y);
      expect(reach).toBeCloseTo(c.radius + CIRCLE_LABEL_GAP, 5);
    }
  });
});
