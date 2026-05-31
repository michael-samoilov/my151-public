import { describe, it, expect } from 'vitest';
import { countTypes, buildTypeRows } from './typeDistribution';
import type { Pokemon } from '@/types/pokemon';

const mon = (...types: string[]) => ({ types } as Pokemon);

describe('countTypes', () => {
  it('counts each type, counting dual-types for both', () => {
    const counts = countTypes([mon('grass', 'poison'), mon('fire'), mon('grass')]);
    expect(counts.grass).toBe(2);
    expect(counts.poison).toBe(1);
    expect(counts.fire).toBe(1);
  });

  it('includes every type name with 0 when absent', () => {
    const counts = countTypes([mon('water')]);
    expect(counts.dragon).toBe(0);
    expect(counts.normal).toBe(0);
    expect(Object.keys(counts).length).toBeGreaterThanOrEqual(18);
  });

  it('returns all zeros for no pokemon', () => {
    const counts = countTypes([]);
    expect(Object.values(counts).every((c) => c === 0)).toBe(true);
  });
});

describe('buildTypeRows', () => {
  it('computes deviation as percentage above/below baseline proportion', () => {
    // grass: your proportion 0.5, baseline 0.25 -> (0.5/0.25 - 1)*100 = +100%
    const counts = countTypes([mon('grass'), mon('fire')]);
    const rows = buildTypeRows(counts, 2, { grass: 0.25, fire: 0.5 } as Record<string, number>);
    const grass = rows.find((r) => r.label === 'Grass')!;
    const fire = rows.find((r) => r.label === 'Fire')!;
    expect(grass.count).toBe(1);
    expect(Math.round(grass.deviation)).toBe(100);
    // fire: 0.5/0.5 - 1 = 0
    expect(Math.round(fire.deviation)).toBe(0);
  });

  it('yields 0 deviation when baseline proportion is 0', () => {
    const counts = countTypes([mon('ice')]);
    const rows = buildTypeRows(counts, 1, {} as Record<string, number>);
    expect(rows.find((r) => r.label === 'Ice')!.deviation).toBe(0);
  });

  it('produces a row per type with a capitalized label', () => {
    const rows = buildTypeRows(countTypes([mon('grass')]), 1, {} as Record<string, number>);
    expect(rows.length).toBeGreaterThanOrEqual(18);
    expect(rows.every((r) => /^[A-Z]/.test(r.label))).toBe(true);
  });
});
