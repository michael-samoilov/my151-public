import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

let canRecordToolExport: (env?: string, notme?: boolean) => boolean;
let isPreviewDeploy: (env?: string) => boolean;
let parseNotmeFlag: (v: unknown) => boolean;
let previewExportHighlight: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
) => { ordinal: number; tool: string; firstPokemonId: number | null };
let bumpDexPickFreq: (newIds: number[]) => Promise<void>;
let recordToolExport: (
  tool: 'pokedex' | 'league' | 'card',
  pokemonIds: number[],
  opts?: { notme?: boolean },
) => Promise<{ ordinal: number; tool: string; firstPokemonId: number | null } | null>;

beforeAll(async () => {
  process.env.UPSTASH_REDIS_REST_URL ||= 'https://example.upstash.io';
  process.env.UPSTASH_REDIS_REST_TOKEN ||= 'test-token';
  ({ bumpDexPickFreq, canRecordToolExport, isPreviewDeploy, parseNotmeFlag, previewExportHighlight, recordToolExport } = await import('../../../api/_exportStats'));
});

/** Stub fetch so the Upstash SDK talks to nothing, and record each command it
 *  sends. Upstash bills per command, pipelined or not, so this list is the bill. */
function recordRedisCommands(): string[][] {
  const commands: string[][] = [];
  const reply = (cmd: string[]) => {
    switch (cmd[0].toLowerCase()) {
      case 'smismember':
        return cmd.slice(2).map(() => 0);
      case 'hmget':
        return cmd.slice(2).map(() => null);
      case 'sadd':
        return cmd.length - 2;
      default:
        return 1;
    }
  };
  vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
    // The SDK auto-pipelines, so a body is one command or a batch of them.
    const body = JSON.parse(init.body) as string[] | string[][];
    if (!Array.isArray(body[0])) {
      commands.push(body as string[]);
      return new Response(JSON.stringify({ result: reply(body as string[]) }));
    }
    const batch = body as string[][];
    commands.push(...batch);
    return new Response(JSON.stringify(batch.map((cmd) => ({ result: reply(cmd) }))));
  });
  return commands;
}

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

  it('spends a fixed number of Redis commands however many Pokémon are exported', async () => {
    // The old one-command-per-Pokémon shape spent 2 × 151 + 2 = 304 on a full Pokédex export.
    vi.stubEnv('VERCEL_ENV', 'production');
    const commands = recordRedisCommands();
    try {
      const ids = Array.from({ length: 151 }, (_, i) => i + 1);
      await expect(recordToolExport('pokedex', ids)).resolves.toEqual({
        ordinal: 1,
        tool: 'pokedex',
        firstPokemonId: 1,
      });
      expect(commands.map((c) => c[0].toLowerCase())).toEqual(['hincrby', 'smismember', 'hmget', 'sadd']);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('counts a whole batch of newly placed Pokémon in one Redis command', async () => {
    // The old pipeline of HINCRBY spent one command per Pokémon: 151 on a first full build.
    const commands = recordRedisCommands();
    try {
      await bumpDexPickFreq(Array.from({ length: 151 }, (_, i) => i + 1));
      expect(commands).toHaveLength(1);
      expect(commands[0][0].toLowerCase()).toBe('eval');
      expect(commands[0].slice(-151)).toEqual(Array.from({ length: 151 }, (_, i) => String(i + 1)));
    } finally {
      vi.unstubAllGlobals();
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
