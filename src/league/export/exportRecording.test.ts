import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let canRecordToolExport: (env?: string) => boolean;
let previewExportHighlight: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
) => { ordinal: number; tool: string; firstPokemonId: number | null };
let recordToolExport: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
) => Promise<{ ordinal: number; tool: string; firstPokemonId: number | null } | null>;

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ canRecordToolExport, previewExportHighlight, recordToolExport } = await import('../../../api/_exportStats'));
});

describe('export uniqueness recording', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('records only on production', () => {
    expect(canRecordToolExport('production')).toBe(true);
    expect(canRecordToolExport('preview')).toBe(false);
    expect(canRecordToolExport('development')).toBe(false);
    expect(canRecordToolExport(undefined)).toBe(false);
  });

  it('returns a preview highlight without touching Redis off production', async () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'preview';
    try {
      await expect(recordToolExport('league', [25, 1])).resolves.toEqual({
        ordinal: 151,
        tool: 'league',
        firstPokemonId: 25,
      });
      expect(previewExportHighlight('pokedex', [6])).toEqual({
        ordinal: 151,
        tool: 'pokedex',
        firstPokemonId: 6,
      });
    } finally {
      process.env.VERCEL_ENV = prev;
    }
  });
});
