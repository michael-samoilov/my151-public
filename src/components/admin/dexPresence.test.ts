import { describe, expect, it } from 'vitest';
import { applyDexPresence, idsOutsideSections } from './dexPresence';

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
