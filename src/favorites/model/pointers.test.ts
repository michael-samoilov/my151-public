import { describe, expect, it } from 'vitest';
import { pointerMarks, pointerPool, prunePointers } from './pointers';

const fills = {
  'fire|1': 4,
  'starter|1': 4,
  'gimmick|1': 6,
  'legendary|1': 144,
  'fire|favorite': 4,
  'favorite|1': 4,
  'legendary|legendary': 144,
};

describe('pointerPool', () => {
  it('draws the overall gimmick pointer from its row and column with source badges', () => {
    const gimmickFills = {
      'gimmick|8': 888,
      'fairy|gimmick': 888,
      'steel|gimmick': 888,
      'starter|gimmick': 25,
      'legendary|gimmick': 150,
    };
    expect(pointerPool('gimmick', 'gimmick', gimmickFills)).toEqual([888, 25, 150]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 888)).toEqual([
      { source: 'gen', value: 8 },
      { source: 'type', value: 'steel' },
      { source: 'type', value: 'fairy' },
    ]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 150)).toEqual([{ source: 'legendary' }]);
    expect(pointerMarks('gimmick', 'gimmick', gimmickFills, 25)).toEqual([{ source: 'starter' }]);
    expect(prunePointers({ ...gimmickFills, 'gimmick|gimmick': 25 })['gimmick|gimmick']).toBe(25);
  });
  it('includes generation, type, and overall legendary favorites in the final pointer', () => {
    expect(pointerPool('favorite', 'favorite', fills)).toEqual([4, 144]);
    expect(pointerMarks('favorite', 'favorite', fills, 4)).toEqual([
      { source: 'type', value: 'fire' },
      { source: 'gen', value: 1 },
    ]);
    expect(pointerMarks('favorite', 'favorite', fills, 144)).toEqual([{ source: 'legendary' }]);
  });

  it('marks a row pointer by source column and a column pointer by source generation', () => {
    expect(pointerMarks('favorite', 1, fills, 4)).toEqual([
      { source: 'type', value: 'fire' },
      { source: 'starter' },
    ]);
    expect(pointerMarks('favorite', 1, fills, 6)).toEqual([{ source: 'gimmick' }]);
    expect(pointerMarks('favorite', 1, fills, 144)).toEqual([{ source: 'legendary' }]);
    expect(pointerMarks('fire', 'favorite', fills, 4)).toEqual([{ source: 'gen', value: 1 }]);
  });

  it('orders category favorites after generation favorites and shows their badges', () => {
    const categoryFills = {
      'fire|favorite': 4,
      'favorite|1': 25,
      'starter|favorite': 1,
      'gimmick|gimmick': 6,
      'legendary|legendary': 150,
    };
    expect(pointerPool('favorite', 'favorite', categoryFills)).toEqual([4, 25, 1, 6, 150]);
    expect(pointerMarks('favorite', 'favorite', categoryFills, 1)).toEqual([{ source: 'starter' }]);
    expect(pointerMarks('favorite', 'favorite', categoryFills, 6)).toEqual([{ source: 'gimmick' }]);
    expect(pointerMarks('favorite', 'favorite', categoryFills, 150)).toEqual([{ source: 'legendary' }]);
  });

  it('shows every type and generation that supplied the overall legendary pointer', () => {
    const legendaryFills = {
      'legendary|5': 643,
      'dragon|legendary': 643,
      'fire|legendary': 643,
      'legendary|3': 384,
      'legendary|gimmick': 384,
    };
    expect(pointerPool('legendary', 'legendary', legendaryFills)).toEqual([384, 643]);
    expect(pointerMarks('legendary', 'legendary', legendaryFills, 643)).toEqual([
      { source: 'gen', value: 5 },
      { source: 'type', value: 'fire' },
      { source: 'type', value: 'dragon' },
    ]);
    expect(pointerMarks('legendary', 'legendary', legendaryFills, 384)).toEqual([
      { source: 'gen', value: 3 },
      { source: 'gimmick' },
    ]);
  });

  it('keeps pointer picks in template order rather than grouping forms by species', () => {
    const ordered = {
      'fighting|6': 701,
      'starter|6': 650,
      'gimmick|6': 10300,
      'legendary|6': 716,
      'fire|1': 4,
      'fire|2': 155,
    };
    expect(pointerPool('favorite', 6, ordered)).toEqual([701, 650, 716, 10300]);
    expect(pointerPool('fire', 'favorite', ordered)).toEqual([4, 155]);
    expect(pointerMarks('favorite', 6, ordered, 10300)).toEqual([{ source: 'gimmick' }]);
    expect(pointerMarks('fire', 'favorite', ordered, 155)).toEqual([{ source: 'gen', value: 2 }]);
  });

  it('retains the overall favorite when its legendary source is still filled', () => {
    expect(prunePointers({ ...fills, 'favorite|favorite': 144 })['favorite|favorite']).toBe(144);
    const removed = { ...fills, 'favorite|favorite': 144 };
    delete (removed as Record<string, number>)['legendary|legendary'];
    expect(prunePointers(removed)['favorite|favorite']).toBeUndefined();
  });
});
