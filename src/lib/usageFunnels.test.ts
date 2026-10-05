// keeps: Exhaustive progress/export combinations catch lost or double-counted browser flows that UI fixtures cannot cover.
import { describe, expect, it } from 'vitest';
import { dexUsageFunnel } from '../../api/_aggregate';
import { dexFunnelSankey, favoriteFunnelSankey, referrerFlowSankey } from './usageFunnels';

function namesOf(sankey: { nodes: { name: string }[] }): string[] {
  return sankey.nodes.map((n) => n.name);
}

function targetsFrom(sankey: { links: { source: string; target: string }[] }, source: string): string[] {
  return sankey.links.filter((l) => l.source === source).map((l) => l.target);
}

function flowInto(sankey: { links: { target: string; value: number }[] }, name: string): number {
  return sankey.links.filter((l) => l.target === name).reduce((s, l) => s + l.value, 0);
}

function flowOut(sankey: { links: { source: string; value: number }[] }, name: string): number {
  return sankey.links.filter((l) => l.source === name).reduce((s, l) => s + l.value, 0);
}

describe('dexFunnelSankey', () => {
  it('omits empty bucket nodes', () => {
    const emptyPeel = dexFunnelSankey(
      dexUsageFunnel([{ cid: 'a', peakMon: 10, completed: false, exported: false }], 1),
    );
    expect(emptyPeel.nodes.map((n) => n.name)).not.toContain('31–60');
    expect(emptyPeel.nodes.map((n) => n.name)).toContain('1–30');
  });

  it('joins an incomplete exporter to Exported without a not-exported peel', () => {
    const withExport = dexFunnelSankey(
      dexUsageFunnel(
        [
          { cid: 'a', peakMon: 10, completed: false, exported: true },
          { cid: 'b', peakMon: 10, completed: false, exported: false },
        ],
        2,
      ),
    );
    expect(targetsFrom(withExport, '1–30')).toEqual(['Exported']);
    expect(flowOut(withExport, '1–30')).toBe(1);
    expect(flowInto(withExport, '1–30')).toBe(2);
    expect(namesOf(withExport)).not.toContain('Kept private');
    expect(namesOf(withExport)).not.toContain('1–30 not exported');
  });

  it('keeps an exporting size bucket under Completed', () => {
    const s = dexFunnelSankey(
      dexUsageFunnel(
        [
          { cid: 'a', peakMon: 10, completed: false, exported: true },
          { cid: 'b', peakMon: 151, completed: true, exported: true },
        ],
        2,
      ),
    );
    expect(namesOf(s).indexOf('Completed')).toBeLessThan(namesOf(s).indexOf('1–30'));
  });
});

describe('referrerFlowSankey', () => {
  it('keeps Dex above League', () => {
    const s = referrerFlowSankey([
      { host: 'reddit.com', total: 2, dex: 2, league: 0 },
      { host: 'referrer not known', total: 4, dex: 3, league: 1 },
    ]);
    const names = namesOf(s);
    expect(names.indexOf('Dex')).toBeLessThan(names.indexOf('League'));
  });
});


describe('favoriteFunnelSankey', () => {
  it('conserves each browser through every progress and export combination', () => {
    const stages = ['Not started', '1–64 cells', '65–128 cells', '129–192 cells', '193–256 cells', 'Completed'];
    for (const label of stages) {
      for (let full = 0; full <= 2; full++) {
        for (let simplified = 0; simplified <= 2; simplified++) {
          for (let both = 0; both <= 2; both++) {
            for (let notExported = 0; notExported <= 2; notExported++) {
              const count = full + simplified + both + notExported;
              const s = favoriteFunnelSankey({ opened: count, buckets: [{ label, count, exports: { full, simplified, both }, notExported }] });
              expect(flowOut(s, 'Opened')).toBe(count);
              expect(flowInto(s, label)).toBe(count);
              expect(flowOut(s, label)).toBe(count);
              expect(flowInto(s, 'Full grid')).toBe(full);
              expect(flowInto(s, 'Simplified')).toBe(simplified);
              expect(flowInto(s, 'Both views')).toBe(both);
              expect(flowInto(s, 'Not exported')).toBe(notExported);
              expect(s.links.every(l => l.value > 0)).toBe(true);
            }
          }
        }
      }
    }
  });
  it('keeps export destinations distinct and progress peers in one column', () => {
    const s = favoriteFunnelSankey({ opened: 4, buckets: [
      { label: 'Not started', count: 1, exports: { full: 0, simplified: 0, both: 0 }, notExported: 1 },
      { label: '1–64 cells', count: 1, exports: { full: 1, simplified: 0, both: 0 }, notExported: 0 },
      { label: '193–256 cells', count: 1, exports: { full: 0, simplified: 0, both: 1 }, notExported: 0 },
      { label: 'Completed', count: 1, exports: { full: 0, simplified: 1, both: 0 }, notExported: 0 },
    ] });
    expect(targetsFrom(s, 'Opened')).toEqual(['Completed', '193–256 cells', '1–64 cells', 'Not started']);
    expect(flowOut(s, 'Opened')).toBe(4);
    expect(s.nodes.filter(n => ['Full grid', 'Both views', 'Simplified', 'Not exported'].includes(n.name))).toHaveLength(4);
    expect(s.ariaLabel).toContain('maximum filled cells');
  });
});

describe('Picker acquisition', () => {
  it('counts Picker landings without duplicating a browser total or changing legacy destinations', () => {
    const legacy = referrerFlowSankey([{ host: 'example.com', total: 2, dex: 1, league: 1 }]);
    expect(namesOf(legacy)).toEqual(['example.com', 'Dex', 'League']);
    const expanded = referrerFlowSankey([{ host: 'example.com', total: 3, dex: 1, league: 1, favorites: 2 }]);
    expect(flowInto(expanded, 'Favorites')).toBe(2);
    expect(flowInto(expanded, 'Dex')).toBe(1);
    expect(flowInto(expanded, 'League')).toBe(1);
    expect(expanded.ariaLabel).toContain('favorites');
  });
});
