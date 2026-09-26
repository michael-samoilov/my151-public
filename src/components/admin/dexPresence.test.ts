import { describe, expect, it } from 'vitest';
import { idsOutsideSections, keepMountedSections } from './dexPresence';

describe('idsOutsideSections', () => {
  it('keeps unique ids that never appear in the layout sections', () => {
    const sectioned = new Set([1, 4]);
    expect(idsOutsideSections([[1, 25], [4, 25, 151], [151]], sectioned)).toEqual([25, 151]);
  });

  it('keeps dropped ids off the leftover list when they have a recorded section', () => {
    const recorded = new Set([252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160]);
    const mounted = keepMountedSections(
      { starter: [495, 496, 497, 725, 726, 727, 158, 159, 160] },
      [
        { starter: [252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160] },
        { starter: [252, 253, 254] },
      ],
      recorded,
    );
    const sectioned = new Set(Object.values(mounted).flat());
    expect(idsOutsideSections([[252, 253, 254], [495, 725, 158]], sectioned)).toEqual([]);
  });
});

describe('keepMountedSections', () => {
  it('appends dropped members after the current section order', () => {
    const recorded = new Set([252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160]);
    const mounted = keepMountedSections(
      { starter: [495, 496, 497, 725, 726, 727, 158, 159, 160] },
      [{ starter: [252, 253, 254, 495, 496, 497, 725, 726, 727, 158, 159, 160] }],
      recorded,
    );
    expect(mounted.starter).toEqual([
      495, 496, 497, 725, 726, 727, 158, 159, 160, 252, 253, 254,
    ]);
  });
});
