import { describe, expect, it } from 'vitest';
import { applyDexPresence, idsOutsideSections, keepMountedSections } from './dexPresence';

function tile(id: number) {
  return { dataset: { dexId: String(id) }, style: { opacity: '' } };
}

describe('idsOutsideSections', () => {
  it('keeps unique ids that never appear in the layout sections', () => {
    const sectioned = new Set([1, 4]);
    expect(idsOutsideSections([[1, 25], [4, 25, 151], [151]], sectioned)).toEqual([25, 151]);
  });

  it('returns an empty list when every id is sectioned', () => {
    expect(idsOutsideSections([[1, 4], [1]], new Set([1, 4]))).toEqual([]);
  });

  it('keeps dropped ids off the leftover list when they have a recorded section', () => {
    const mounted = keepMountedSections(
      { starter: [495, 496, 497, 725, 726, 727, 158, 159, 160] },
      [
        { starter: [252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160] },
        { starter: [252, 253, 254] },
      ],
    );
    const sectioned = new Set(Object.values(mounted).flat());
    expect(idsOutsideSections([[252, 253, 254], [495, 725, 158]], sectioned)).toEqual([]);
  });
});

describe('keepMountedSections', () => {
  it('appends dropped members after the current section order', () => {
    const mounted = keepMountedSections(
      { starter: [495, 496, 497, 725, 726, 727, 158, 159, 160] },
      [{ starter: [252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160] }],
    );
    expect(mounted.starter).toEqual([
      495, 496, 497, 725, 726, 727, 158, 159, 160, 252, 253, 254,
    ]);
  });

  it('keeps a moved id in the latest section only', () => {
    const mounted = keepMountedSections({ meadow: [1] }, [{ forest: [1], meadow: [1] }]);
    expect(mounted.meadow).toEqual([1]);
    expect(mounted.forest).toBeUndefined();
  });

  it('still reports ids that never appear in any section map', () => {
    const mounted = keepMountedSections({ starter: [1] }, [{ starter: [1] }]);
    const sectioned = new Set(Object.values(mounted).flat());
    expect(idsOutsideSections([[1, 152], [1]], sectioned)).toEqual([152]);
  });
});

describe('applyDexPresence', () => {
  it('fades ids that are not in the session set', () => {
    const nodes = [tile(1), tile(25), tile(151)];
    applyDexPresence(
      { querySelectorAll: () => nodes } as unknown as ParentNode,
      new Set([1, 151]),
    );
    expect(nodes.map((n) => n.style.opacity)).toEqual(['1', '0.14', '1']);
  });

  it('shows every tile when the session contains all ids', () => {
    const nodes = [tile(4), tile(5)];
    nodes[0].style.opacity = '0.14';
    applyDexPresence(
      { querySelectorAll: () => nodes } as unknown as ParentNode,
      new Set([4, 5]),
    );
    expect(nodes.map((n) => n.style.opacity)).toEqual(['1', '1']);
  });
});
