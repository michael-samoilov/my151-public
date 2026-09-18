import { describe, expect, it } from 'vitest';
import { dexExportFrameKey, dexExportPermutations, type DexExportDraft } from './dexExportDraft';

const base: DexExportDraft = {
  sort: 'build-order',
  showSections: true,
  groupSpecialAtEnd: true,
  customOrder: null,
  showStats: false,
};

describe('dexExportDraft', () => {
  it('keeps outlines out of the frame key when Build order is not selected', () => {
    const on = dexExportFrameKey({ ...base, sort: 'national', showSections: true });
    const off = dexExportFrameKey({ ...base, sort: 'national', showSections: false });
    expect(on).toBe(off);
  });

  it('lists every switchable permutation once, active settings first-class', () => {
    const keys = dexExportPermutations(base, true).map(dexExportFrameKey);
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toContain(dexExportFrameKey(base));
    expect(keys.some((key) => key.startsWith('national|'))).toBe(true);
    expect(keys.filter((key) => key.startsWith('build-order|')).length).toBe(8);
  });
});
