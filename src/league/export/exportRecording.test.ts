import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let canRecordToolExport: (env?: string, notme?: boolean) => boolean;
let isPreviewDeploy: (env?: string) => boolean;
let parseNotmeFlag: (v: unknown) => boolean;
let previewExportHighlight: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
) => { ordinal: number; tool: string; firstPokemonId: number | null };
let recordToolExport: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
  opts?: { notme?: boolean },
) => Promise<{ ordinal: number; tool: string; firstPokemonId: number | null } | null>;

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ canRecordToolExport, isPreviewDeploy, parseNotmeFlag, previewExportHighlight, recordToolExport } = await import('../../../api/_exportStats'));
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

  it('does not record when the request is notme, even on production', () => {
    expect(parseNotmeFlag(true)).toBe(true);
    expect(parseNotmeFlag(false)).toBe(false);
    expect(parseNotmeFlag('true')).toBe(false);
    expect(parseNotmeFlag(1)).toBe(false);
    expect(canRecordToolExport('production', true)).toBe(false);
  });

  it('does not record on a Vercel preview, even without notme', () => {
    expect(isPreviewDeploy('preview')).toBe(true);
    expect(isPreviewDeploy('production')).toBe(false);
    expect(canRecordToolExport('preview', false)).toBe(false);
  });

  it('records on production when notme is absent', () => {
    expect(canRecordToolExport('production', false)).toBe(true);
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

  it('returns a preview highlight for a notme export on production', async () => {
    const prev = process.env.VERCEL_ENV;
    process.env.VERCEL_ENV = 'production';
    try {
      await expect(recordToolExport('card', [6, 9], { notme: true })).resolves.toEqual({
        ordinal: 151,
        tool: 'card',
        firstPokemonId: 6,
      });
    } finally {
      process.env.VERCEL_ENV = prev;
    }
  });
});
