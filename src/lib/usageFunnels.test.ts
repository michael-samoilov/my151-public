import { describe, expect, it } from 'vitest';
import { dexUsageFunnel, leagueUsageFunnel } from '../../api/_aggregate';
import { dexFunnelSankey, leagueFunnelSankey, nodeDepth, referrerFlowSankey } from './usageFunnels';

describe('dexFunnelSankey', () => {
  const sankey = dexFunnelSankey(
    dexUsageFunnel(
      [
        { cid: 'a', peakMon: 10, completed: false, exported: false },
        { cid: 'b', peakMon: 40, completed: false, exported: false },
        { cid: 'c', peakMon: 80, completed: false, exported: false },
        { cid: 'd', peakMon: 110, completed: false, exported: false },
        { cid: 'e', peakMon: 140, completed: false, exported: false },
        { cid: 'f', peakMon: 151, completed: true, exported: true },
        { cid: 'g', peakMon: 151, completed: true, exported: false },
      ],
      12,
    ),
  );

  it('conserves flow at Built and Completed', () => {
    const into = (name: string) => sankey.links.filter((l) => l.target === name).reduce((s, l) => s + l.value, 0);
    const out = (name: string) => sankey.links.filter((l) => l.source === name).reduce((s, l) => s + l.value, 0);
    expect(out('Saw intro')).toBe(into('Saw intro') + 12);
    expect(out('Built')).toBe(into('Built'));
    expect(out('Completed')).toBe(into('Completed'));
  });

  it('places earlier size peels further left than later ones', () => {
    expect(nodeDepth('1–30', sankey.links)).toBeLessThan(nodeDepth('31–60', sankey.links));
    expect(nodeDepth('31–60', sankey.links)).toBeLessThan(nodeDepth('61–90', sankey.links));
    expect(nodeDepth('61–90', sankey.links)).toBeLessThan(nodeDepth('91–120', sankey.links));
    expect(nodeDepth('91–120', sankey.links)).toBeLessThan(nodeDepth('121–150', sankey.links));
  });

  it('omits empty peel nodes', () => {
    const emptyPeel = dexFunnelSankey(
      dexUsageFunnel([{ cid: 'a', peakMon: 10, completed: false, exported: false }], 1),
    );
    expect(emptyPeel.nodes.map((n) => n.name)).not.toContain('31–60');
    expect(emptyPeel.nodes.map((n) => n.name)).toContain('1–30');
  });
});

describe('leagueFunnelSankey', () => {
  const sankey = leagueFunnelSankey(
    leagueUsageFunnel(
      [
        { maxCards: 2, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 6, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 10, exportsCard: 1, exportsLeague: 0 },
        { maxCards: 14, exportsCard: 1, exportsLeague: 1 },
        { maxCards: 14, exportsCard: 1, exportsLeague: 0 },
      ],
      8,
      14,
    ),
  );

  it('places earlier card peels further left', () => {
    expect(nodeDepth('1–3 cards', sankey.links)).toBeLessThan(nodeDepth('4–7 cards', sankey.links));
    expect(nodeDepth('4–7 cards', sankey.links)).toBeLessThan(nodeDepth('8–11 cards', sankey.links));
  });

  it('splits full-league export kinds off Full league', () => {
    const fromFull = sankey.links.filter((l) => l.source === 'Full league');
    expect(fromFull.map((l) => l.target).sort()).toEqual(['Exported card', 'Exported league']);
  });

  it('conserves seated inflow', () => {
    const intoSeated = sankey.links.filter((l) => l.target === 'Seated').reduce((s, l) => s + l.value, 0);
    const outSeated = sankey.links.filter((l) => l.source === 'Seated').reduce((s, l) => s + l.value, 0);
    expect(intoSeated).toBe(outSeated);
  });
});

describe('referrerFlowSankey', () => {
  it('names the unknown-referrer source in the accessible label', () => {
    const s = referrerFlowSankey([
      { host: 'reddit.com', total: 2, dex: 2, league: 0 },
      { host: 'referrer not known', total: 4, dex: 3, league: 1 },
    ]);
    expect(s.ariaLabel).toContain('referrer not known');
    expect(s.nodes.map((n) => n.name)).toContain('referrer not known');
  });
});
