import { describe, expect, it } from 'vitest';
import { tallyJoints } from '../../api/_aggregate';
import {
  ICON_PX,
  clampedN,
  dimTitle,
  inBarKind,
  keepWord,
  labelsCollide,
  layoutLabels,
  mixCounts,
  muteFill,
  orderedKeys,
  sliceFill,
  sliceGeometry,
  type PlatformJoint,
} from './platformStacks';

const joints: PlatformJoint[] = [
  { device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 150 },
  { device: 'Desktop', os: 'Windows', browser: 'Edge', n: 31 },
  { device: 'Desktop', os: 'macOS', browser: 'Chrome', n: 40 },
  { device: 'Desktop', os: 'macOS', browser: 'Safari', n: 6 },
  { device: 'Desktop', os: 'Linux', browser: 'Firefox', n: 12 },
  { device: 'Mobile', os: 'iOS', browser: 'Safari', n: 70 },
  { device: 'Mobile', os: 'iOS', browser: 'Chrome', n: 8 },
  { device: 'Mobile', os: 'Android', browser: 'Chrome', n: 50 },
  { device: 'Tablet', os: 'iOS', browser: 'Safari', n: 9 },
  { device: 'Tablet', os: 'Android', browser: 'Chrome', n: 12 },
];

describe('tallyJoints', () => {
  it('groups the three fields and skips no rows', () => {
    expect(
      tallyJoints([
        { device: 'Desktop', os: 'Windows', browser: 'Chrome' },
        { device: 'Desktop', os: 'Windows', browser: 'Chrome' },
        { device: 'Mobile', os: 'iOS', browser: 'Safari' },
        { device: undefined, os: undefined, browser: undefined },
      ]),
    ).toEqual([
      { device: 'Desktop', os: 'Windows', browser: 'Chrome', n: 2 },
      { device: 'Mobile', os: 'iOS', browser: 'Safari', n: 1 },
      { device: 'Unknown', os: 'Unknown', browser: 'Unknown', n: 1 },
    ]);
  });
});

describe('mixCounts', () => {
  it('keeps the driving dimension on the full mix', () => {
    const os = mixCounts(joints, 'os', { dim: 'os', value: 'iOS' });
    expect(os.iOS).toBe(87);
    expect(os.Windows).toBe(181);
  });

  it('reclamps the other dimensions among the selected value', () => {
    const device = mixCounts(joints, 'device', { dim: 'os', value: 'iOS' });
    expect(device).toEqual({ Mobile: 78, Tablet: 9 });
    expect(clampedN(joints, { dim: 'os', value: 'iOS' })).toBe(87);
  });
});

describe('orderedKeys', () => {
  it('keeps Desktop left of Mobile even when Mobile is larger', () => {
    expect(orderedKeys({ Mobile: 80, Desktop: 5, Tablet: 9 }, 'device')).toEqual([
      'Desktop',
      'Mobile',
      'Tablet',
    ]);
  });
});

describe('keepWord', () => {
  it('always spells iOS and macOS', () => {
    expect(keepWord('iOS')).toBe(true);
    expect(keepWord('macOS')).toBe(true);
    expect(keepWord('Windows')).toBe(false);
    expect(keepWord('Edge')).toBe(false);
    expect(keepWord('ChromeOS')).toBe(false);
    expect(keepWord('Samsung Internet')).toBe(false);
  });
});

describe('layoutLabels', () => {
  const measure = (word: string) => {
    if (word === 'macOS') return 42;
    if (word === 'Windows') return 52;
    if (word === 'Chrome') return 46;
    if (word === 'Safari') return 38;
    if (word === 'Edge') return 28;
    return word.length * 7;
  };

  it('drops the Edge word on a 26px slice and keeps it left-aligned', () => {
    const slices = sliceGeometry({ Chrome: 52, Safari: 27, Firefox: 9, Edge: 8, Other: 4 }, 'browser', 332);
    const edge = slices.find((s) => s.key === 'Edge');
    expect(edge).toBeTruthy();
    expect(edge!.widthPx).toBeLessThan(28);
    const labels = layoutLabels(slices, 332, measure);
    const edgeLab = labels.find((l) => l.key === 'Edge')!;
    expect(edgeLab.showWord).toBe(false);
    expect(edgeLab.align).toBe('start');
    expect(edgeLab.leftPx).toBe(edge!.leftPx);
  });

  it('right-aligns a tail icon that cannot fit in its slice', () => {
    const slices = sliceGeometry(
      { Windows: 49, iOS: 20, Android: 16, macOS: 12, Linux: 3 },
      'os',
      332,
    );
    const linux = slices.find((s) => s.key === 'Linux')!;
    expect(linux.widthPx).toBeLessThan(ICON_PX);
    const labels = layoutLabels(slices, 332, measure);
    const linuxLab = labels.find((l) => l.key === 'Linux')!;
    expect(linuxLab.showWord).toBe(false);
    expect(linuxLab.align).toBe('end');
    expect(linuxLab.leftPx).toBe(332 - ICON_PX);
  });

  it('keeps the macOS word and shifts it on the same row', () => {
    const slices = sliceGeometry(
      { Windows: 49, iOS: 20, Android: 16, macOS: 12, Linux: 3 },
      'os',
      332,
    );
    const mac = slices.find((s) => s.key === 'macOS')!;
    const labels = layoutLabels(slices, 332, measure);
    const macLab = labels.find((l) => l.key === 'macOS')!;
    expect(macLab.showWord).toBe(true);
    expect(macLab.widthPx).toBeGreaterThan(mac.widthPx);
    const linuxLab = labels.find((l) => l.key === 'Linux')!;
    expect(macLab.leftPx + macLab.widthPx + 5).toBeLessThanOrEqual(linuxLab.leftPx + 0.5);
  });

  it('does not stack OS labels on a 326px Incomplete mix with ChromeOS', () => {
    const slices = sliceGeometry(
      { Windows: 193, iOS: 56, Android: 82, macOS: 26, Linux: 7, ChromeOS: 8 },
      'os',
      326,
    );
    const labels = layoutLabels(slices, 326, measure);
    expect(labelsCollide(labels, 326)).toBe(false);
    expect(labels.find((l) => l.key === 'iOS')!.showWord).toBe(true);
    expect(labels.find((l) => l.key === 'macOS')!.showWord).toBe(true);
    expect(labels.find((l) => l.key === 'ChromeOS')!.showWord).toBe(false);
  });

  it('does not stack browser labels on a 326px mix with Samsung Internet', () => {
    const slices = sliceGeometry(
      { Chrome: 156, Safari: 60, Firefox: 52, Edge: 97, Opera: 4, 'Samsung Internet': 12 },
      'browser',
      326,
    );
    const labels = layoutLabels(slices, 326, measure);
    expect(labelsCollide(labels, 326)).toBe(false);
  });
});

describe('sliceGeometry', () => {
  it('keeps every slice inside the bar', () => {
    const slices = sliceGeometry(
      { Windows: 49, iOS: 20, Android: 16, macOS: 12, Linux: 3 },
      'os',
      332,
    );
    for (const s of slices) {
      expect(s.leftPx + s.widthPx).toBeLessThanOrEqual(332 + 0.01);
    }
  });
});

describe('inBarKind', () => {
  it('puts % only on the first slice that can hold a number', () => {
    const slices = sliceGeometry({ Chrome: 52, Safari: 27, Firefox: 9, Edge: 8 }, 'browser', 332);
    expect(inBarKind(slices)).toEqual(['pct', 'int', 'int', 'int']);
  });
});

describe('muteFill', () => {
  it('mixes a little brand into the track grey', () => {
    expect(muteFill('iOS')).toMatch(/^rgb\(/);
    expect(muteFill('iOS')).not.toBe('#1d1d1f');
  });
});

describe('sliceFill', () => {
  it('mutes unselected siblings on the driving bar only', () => {
    const clamp = { dim: 'os' as const, value: 'iOS' };
    expect(sliceFill('iOS', 'os', clamp)).toBe('#1d1d1f');
    expect(sliceFill('Windows', 'os', clamp)).toMatch(/^rgb\(/);
    expect(sliceFill('Mobile', 'device', clamp)).toBe('#2563eb');
  });
});

describe('dimTitle', () => {
  it('is only the dimension name, with among when another bar is the clamp', () => {
    expect(dimTitle('os', null)).toBe('OS');
    expect(dimTitle('os', { dim: 'os', value: 'iOS' })).toBe('OS');
    expect(dimTitle('device', { dim: 'os', value: 'iOS' })).toBe('Device among iOS');
    expect(dimTitle('browser', { dim: 'os', value: 'iOS' })).toBe('Browser among iOS');
  });
});
