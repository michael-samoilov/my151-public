import { describe, expect, it } from 'vitest';
import { regionOf } from './countryRegions';

describe('regionOf', () => {
  it('groups anything unrecognized rather than dropping it, so totals still sum', () => {
    expect(regionOf(undefined)).toBe('Unknown');
    expect(regionOf('')).toBe('Unknown');
    expect(regionOf('ZZ')).toBe('Unknown');
  });

  it('covers every country seen in production', () => {
    const observed = [
      'US', 'GB', 'IT', 'AU', 'CA', 'BR', 'NL', 'DE', 'NZ', 'SG', 'ES', 'CZ', 'CN', 'VN',
      'SE', 'CL', 'IE', 'VU', 'PH', 'NO', 'CH', 'JP', 'HK', 'DK', 'IL', 'IN',
    ];
    const unknown = observed.filter((c) => regionOf(c) === 'Unknown');
    expect(unknown).toEqual([]);
  });
});
