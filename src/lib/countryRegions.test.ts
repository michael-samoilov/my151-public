import { describe, expect, it } from 'vitest';
import { regionOf, regionOrder, REGIONS, REGION_COLORS, REGION_MEMBERS } from './countryRegions';

describe('regionOf', () => {
  it('places countries in their market region', () => {
    expect(regionOf('US')).toBe('North America');
    expect(regionOf('BR')).toBe('Latin America');
    expect(regionOf('MX')).toBe('Latin America');
    expect(regionOf('IT')).toBe('Europe');
    expect(regionOf('VU')).toBe('Asia-Pacific');
    expect(regionOf('IL')).toBe('Middle East & Africa');
  });

  it('accepts lower-case codes', () => {
    expect(regionOf('gb')).toBe('Europe');
  });

  it('groups anything unrecognized rather than dropping it, so totals still sum', () => {
    expect(regionOf(undefined)).toBe('Unknown');
    expect(regionOf('')).toBe('Unknown');
    expect(regionOf('ZZ')).toBe('Unknown');
  });

  // A code listed under two regions resolves to whichever is built last, so the
  // other region silently under-counts. Checked against the raw table, because
  // regionOf() has already collapsed any duplicate by the time it is callable.
  it('assigns every code to exactly one region', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const region of REGIONS) {
      for (const code of REGION_MEMBERS[region]) {
        if (seen.has(code)) dupes.push(code);
        seen.add(code);
      }
    }
    expect(dupes).toEqual([]);
  });

  // The stacked share bar lays these fills out in REGIONS order, and that exact
  // sequence is what was checked for colour-vision separation: it alternates
  // warm and cool so no two warm fills touch, since orange reads the same as
  // both green and red to a red-blind viewer. Re-order the regions or swap a
  // hue and the check has to be run again — so pin the validated sequence
  // rather than let it drift silently.
  it('keeps the validated colour sequence', () => {
    expect(REGIONS.map((r) => REGION_COLORS[r])).toEqual([
      '#3FA129', // Latin America — grass
      '#2980EF', // North America — water
      '#FF8000', // Europe — fighting
      '#9040CC', // Middle East & Africa — poison
      '#E62829', // Asia-Pacific — fire
    ]);
  });

  it('orders Unknown after every real region', () => {
    expect(regionOrder('Unknown')).toBeGreaterThan(regionOrder('Asia-Pacific'));
  });

  // The live tally at the time of writing. If a real country falls through to
  // 'Unknown' the region chart quietly grows a junk row, so pin the countries
  // actually observed in production.
  it('covers every country seen in production', () => {
    const observed = [
      'US', 'GB', 'IT', 'AU', 'CA', 'BR', 'NL', 'DE', 'NZ', 'SG', 'ES', 'CZ', 'CN', 'VN',
      'SE', 'CL', 'IE', 'VU', 'PH', 'NO', 'CH', 'JP', 'HK', 'DK', 'IL', 'IN',
    ];
    const unknown = observed.filter((c) => regionOf(c) === 'Unknown');
    expect(unknown).toEqual([]);
  });
});
