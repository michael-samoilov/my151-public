import { describe, expect, it } from 'vitest';
import { regionOf, REGIONS, REGION_COLORS, REGION_MEMBERS } from './countryRegions';

describe('regionOf', () => {
  it('places countries in their market region', () => {
    expect(regionOf('US')).toBe('North America');
    expect(regionOf('BR')).toBe('Latin America');
    expect(regionOf('MX')).toBe('Latin America');
    expect(regionOf('IT')).toBe('Europe');
    expect(regionOf('VU')).toBe('Asia-Pacific');
    expect(regionOf('IL')).toBe('Middle East & Africa');
    expect(regionOf('MR')).toBe('Middle East & Africa');
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

  // Colour is keyed to the region, never to its rank, so a region keeps its
  // colour as the ordering shifts. Pin the mapping so a hue cannot be swapped
  // without the change being deliberate — the set was checked for colour-vision
  // separation as a whole.
  it('keeps a stable colour per region', () => {
    expect(REGION_COLORS).toEqual({
      'North America': '#2980EF', // water
      'Latin America': '#3FA129', // grass
      Europe: '#FF8000', // fighting
      'Asia-Pacific': '#E62829', // fire
      'Middle East & Africa': '#9040CC', // poison
      Unknown: '#9FA19F', // normal
    });
  });

  it('gives every region a colour', () => {
    for (const region of REGIONS) expect(REGION_COLORS[region]).toMatch(/^#[0-9A-F]{6}$/i);
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
