import { describe, expect, it } from 'vitest';
import { dexUsageFunnel, leagueUsageFunnel } from '../../api/_aggregate';
import { columnPeers, compactFunnelLabelSide } from './sankeyLabels';
import { dexFunnelSankey, leagueFunnelSankey, type FunnelNode } from './usageFunnels';

function side(
  sankey: { nodes: FunnelNode[]; links: Parameters<typeof compactFunnelLabelSide>[2] },
  name: string,
) {
  const n = sankey.nodes.find((node) => node.name === name);
  if (!n) throw new Error(`missing ${name}`);
  return compactFunnelLabelSide(n, sankey.nodes, sankey.links);
}

describe('compactFunnelLabelSide', () => {
  const league = leagueFunnelSankey(
    leagueUsageFunnel(
      [
        { maxCards: 1, maxSeats: 1, fullGyms: 0, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 2, maxSeats: 4, fullGyms: 2, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 6, maxSeats: 12, fullGyms: 6, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 11, maxSeats: 40, fullGyms: 11, exportsCard: 0, exportsLeague: 0 },
        { maxCards: 14, maxSeats: 70, fullGyms: 14, exportsCard: 1, exportsLeague: 1 },
        { maxCards: 14, maxSeats: 70, fullGyms: 14, exportsCard: 0, exportsLeague: 0 },
      ],
      8,
    ),
  );

  const dex = dexFunnelSankey(
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

  it('puts stacked gym buckets on the right even when they have no outgoing link', () => {
    expect(league.links.some((l) => l.source === '5–8 gyms')).toBe(false);
    expect(side(league, '1–4 gyms')).toBe('right');
    expect(side(league, '9–12 gyms')).toBe('right');
    expect(side(league, '5–8 gyms')).toBe('right');
  });

  it('puts stacked size buckets on the right even when they have no outgoing link', () => {
    expect(side(dex, '31–60')).toBe('right');
    expect(side(dex, '91–120')).toBe('right');
    expect(side(dex, '1–30')).toBe('right');
  });

  it('keeps isolated drop-offs on the bottom and column titles on top', () => {
    expect(side(league, 'Bounced')).toBe('bottom');
    expect(side(league, 'Card not finished')).toBe('bottom');
    expect(side(league, 'Full league')).toBe('top');
    expect(side(league, 'Opened')).toBe('top');
    expect(side(league, 'Kept private')).toBe('right');
    expect(side(dex, 'Completed')).toBe('top');
    expect(side(dex, 'Exported')).toBe('right');
  });

  it('never parks a name in the gap between two bars of the same column', () => {
    for (const sankey of [league, dex]) {
      for (const n of sankey.nodes) {
        const peers = columnPeers(n.name, sankey.nodes, sankey.links);
        const i = peers.findIndex((p) => p.name === n.name);
        const labelSide = compactFunnelLabelSide(n, sankey.nodes, sankey.links);
        if (i > 0) expect(labelSide, `${n.name} has a peer above`).not.toBe('top');
        if (i < peers.length - 1) {
          expect(labelSide, `${n.name} has a peer below`).not.toBe('bottom');
        }
      }
    }
  });
});
