import { describe, expect, it } from 'vitest';
import { dexUsageFunnel, leagueUsageFunnel } from '../../api/_aggregate';
import {
  dexFunnelSankey,
  leagueFunnelSankey,
  nodeDepth,
  referrerFlowSankey,
} from './usageFunnels';

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
    expect(flowOut(sankey, 'Saw intro')).toBe(flowInto(sankey, 'Saw intro') + 12);
    expect(flowOut(sankey, 'Built')).toBe(flowInto(sankey, 'Built'));
    expect(flowOut(sankey, 'Completed')).toBe(flowInto(sankey, 'Completed'));
  });

  it('puts every size bucket in the same column as Completed', () => {
    const done = nodeDepth('Completed', sankey.links);
    expect(nodeDepth('1–30', sankey.links)).toBe(done);
    expect(nodeDepth('31–60', sankey.links)).toBe(done);
    expect(nodeDepth('61–90', sankey.links)).toBe(done);
    expect(nodeDepth('91–120', sankey.links)).toBe(done);
    expect(nodeDepth('121–150', sankey.links)).toBe(done);
  });

  it('omits empty bucket nodes', () => {
    const emptyPeel = dexFunnelSankey(
      dexUsageFunnel([{ cid: 'a', peakMon: 10, completed: false, exported: false }], 1),
    );
    expect(emptyPeel.nodes.map((n) => n.name)).not.toContain('31–60');
    expect(emptyPeel.nodes.map((n) => n.name)).toContain('1–30');
  });

  it('stacks Completed above later drop-offs, with 1–30 at the bottom', () => {
    const names = namesOf(sankey);
    expect(names.indexOf('Completed')).toBeLessThan(names.indexOf('121–150'));
    expect(names.indexOf('121–150')).toBeLessThan(names.indexOf('1–30'));
    expect(names.indexOf('Built')).toBeLessThan(names.indexOf('Bounced'));
    expect(names.indexOf('Exported')).toBeLessThan(names.indexOf('Kept private'));
  });

  it('fans every bucket off Built, Completed first', () => {
    const fromBuilt = targetsFrom(sankey, 'Built');
    expect(fromBuilt[0]).toBe('Completed');
    expect(fromBuilt.indexOf('121–150')).toBeLessThan(fromBuilt.indexOf('1–30'));
    const fromIntro = targetsFrom(sankey, 'Saw intro');
    expect(fromIntro.indexOf('Built')).toBeLessThan(fromIntro.indexOf('Bounced'));
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

describe('leagueFunnelSankey', () => {
  const sankey = leagueFunnelSankey(
    leagueUsageFunnel(
      [
        { maxCards: 1, maxSeats: 1, fullGyms: 0, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 2, maxSeats: 4, fullGyms: 2, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 6, maxSeats: 12, fullGyms: 6, exportsCard: 1, exportsLeague: 0 },
        { maxCards: 11, maxSeats: 40, fullGyms: 11, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 14, maxSeats: 70, fullGyms: 14, exportsCard: 1, exportsLeague: 1 },
      ],
      8,
    ),
  );

  it('puts gym buckets in one column off One gym full', () => {
    const parent = nodeDepth('One gym full', sankey.links);
    expect(nodeDepth('1–4 gyms', sankey.links)).toBe(parent + 1);
    expect(nodeDepth('5–8 gyms', sankey.links)).toBe(parent + 1);
    expect(nodeDepth('9–12 gyms', sankey.links)).toBe(parent + 1);
    expect(nodeDepth('Full league', sankey.links)).toBe(parent + 1);
  });

  it('sends bucket exporters to the shared export nodes', () => {
    expect(targetsFrom(sankey, 'Full league')).toEqual(['Exported league']);
    expect(targetsFrom(sankey, '5–8 gyms')).toEqual(['Exported card']);
    expect(targetsFrom(sankey, '1–4 gyms')).toEqual([]);
    expect(namesOf(sankey)).not.toContain('Kept private');
  });

  it('conserves placed and one-gym-full inflow', () => {
    expect(flowOut(sankey, 'Placed a Pokémon')).toBe(flowInto(sankey, 'Placed a Pokémon'));
    expect(flowOut(sankey, 'One gym full')).toBe(flowInto(sankey, 'One gym full'));
  });

  it('stacks Full league above earlier gym drop-offs', () => {
    const names = namesOf(sankey);
    expect(names.indexOf('Full league')).toBeLessThan(names.indexOf('9–12 gyms'));
    expect(names.indexOf('9–12 gyms')).toBeLessThan(names.indexOf('1–4 gyms'));
    expect(names.indexOf('Exported league')).toBeLessThan(names.indexOf('Exported card'));
    const fromGym = targetsFrom(sankey, 'One gym full');
    expect(fromGym[0]).toBe('Full league');
  });

  it('peels bounced and unfinished cards before the gym fan', () => {
    expect(targetsFrom(sankey, 'Opened')).toEqual(['Placed a Pokémon', 'Bounced']);
    expect(targetsFrom(sankey, 'Placed a Pokémon').sort()).toEqual(['Card not finished', 'One gym full']);
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

  it('keeps Dex above League', () => {
    const s = referrerFlowSankey([
      { host: 'reddit.com', total: 2, dex: 2, league: 0 },
      { host: 'referrer not known', total: 4, dex: 3, league: 1 },
    ]);
    const names = namesOf(s);
    expect(names.indexOf('Dex')).toBeLessThan(names.indexOf('League'));
  });
});
