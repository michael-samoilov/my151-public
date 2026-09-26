import { describe, expect, it } from 'vitest';
import { dexUsageFunnel } from '../../api/_aggregate';
import { dexFunnelSankey, referrerFlowSankey } from './usageFunnels';

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
