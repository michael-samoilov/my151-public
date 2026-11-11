import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { WRITTEN_RULES } from './writtenRules.mjs';

const SAMPLES: Record<string, { file: string; bad: string; good: string }> = {
  'keep-saved-picks': {
    file: 'src/lib/sample.ts',
    bad: 'localStorage.clear();',
    good: "localStorage.removeItem('my151-notme');",
  },
  'versioned-store': {
    file: 'src/store/sample.ts',
    bad: "persist(() => ({}), { name: 'k' });",
    good: "persist(() => ({}), { name: 'k', version: 2, migrate: (s: unknown) => s });",
  },
  'server-secrets-stay-server-side': {
    file: 'scripts/sample.ts',
    bad: 'export const token = process.env.UPSTASH_REDIS_REST_TOKEN;',
    good: 'export const key = process.env.PAGESPEED_API_KEY;',
  },
  'one-deploy-constant': {
    file: 'src/lib/sample.ts',
    bad: 'export const v = __BUILD_TIMESTAMP__;',
    good: "export { BUILD_VERSION } from './buildVersion';",
  },
  'revised-sprite-urls': {
    file: 'src/lib/sample.ts',
    bad: "export const u = '/sprites/export/leaf-crown.png';",
    good: "import { revisedSprite } from './spriteUrl';\nexport const u = revisedSprite('/sprites/export/leaf-crown.png');",
  },
  'ontology-stays-off-the-browser': {
    file: 'src/lib/sample.ts',
    bad: "import graph from '../../data/ontology/species.json';\nexport default graph;",
    good: "import pokemon from '@/data/pokemon.json';\nexport default pokemon;",
  },
  'light-mode-only': {
    file: 'src/components/sample.tsx',
    bad: "export const c = 'text-red-500 ' + 'dark' + ':text-red-400';".replace("' + 'dark' + '", 'dark'),
    good: "export const c = 'text-red-500';",
  },
  'img-alt': {
    file: 'src/components/sample.tsx',
    bad: "export const i = <img src='/a.png' />;",
    good: "export const i = <img src='/a.png' alt='' />;",
  },
  'resize-observer-fallback-first': {
    file: 'src/sample/main.tsx',
    bad: "import { StrictMode } from 'react';\nimport '../lib/resizeObserverFallback';",
    good: "import '../lib/resizeObserverFallback';\nimport { StrictMode } from 'react';",
  },
  'specs-record-their-files': {
    file: 'e2e/sample.spec.ts',
    bad: "import { test } from '@playwright/test';\ntest('x', () => {});",
    good: "import { test } from './support/test';\ntest('x', () => {});",
  },
  'no-viewport-type': {
    file: 'src/components/sample.tsx',
    bad: "export const c = 'text-[clamp(1rem,4' + 'vw,2rem)]';".replace("' + '", ''),
    good: "export const c = 'text-base';",
  },
  'hub-height-holds-still': {
    file: 'src/components/home/sample.tsx',
    bad: "export const c = 'flex min-h-dvh flex-col';",
    good: "export const c = 'flex min-h-svh flex-col';",
  },
  'intro-stack-loads-whole': {
    file: 'src/components/pokedex/IntroCard.tsx',
    bad: "export const i = <img src='/a.avif' alt='' loading='lazy' />;",
    good: "export const i = <img src='/a.avif' alt='' />;",
  },
  'league-zoom-floor': {
    file: 'src/league/sample.ts',
    bad: 'useFitScale(ref, 1, 0.5);',
    good: 'useFitScale(ref, 1, 0.55);',
  },
  'no-contact-in-user-agent': {
    file: 'scripts/sample.ts',
    bad: "fetch('https://x.test', { headers: { 'user-agent': 'tool (someone@example.com)' } });",
    good: "fetch('https://x.test', { headers: { 'user-agent': 'my151-tool' } });",
  },
  'no-automation-stealth': {
    file: 'scripts/sample.ts',
    bad: "export const args = ['--disable-blink-features=AutomationControlled'];",
    good: "export const args = ['--no-sandbox'];",
  },
  'no-test-retries': {
    file: 'playwright.config.ts',
    bad: "export default { retries: process.env.CI ? 2 : 0, use: { trace: 'on-first-retry' } };",
    good: "export default { retries: 0, use: { trace: 'off' } };",
  },
  'no-beacon-heartbeat': {
    file: 'src/lib/beaconScheduler.ts',
    bad: 'setInterval(() => undefined, 1000);',
    good: 'setTimeout(() => undefined, 1000);',
  },
  'tune-hook-in-one-place': {
    file: 'src/lib/sample.ts',
    bad: 'window.__pokedexStore = {};',
    good: 'window.name = "x";',
  },
  'admin-token-in-header': {
    file: 'api/sample.ts',
    bad: 'export const t = (req: { query: Record<string, string> }) => req.query.token;',
    good: 'export const t = (req: { headers: Record<string, string> }) => req.headers.authorization;',
  },
  'no-precise-location': {
    file: 'api/sample.ts',
    bad: "export const h = 'x-vercel-ip-city';",
    good: "export const h = 'x-vercel-ip-country';",
  },
  'no-secret-logging': {
    file: 'scripts/sample.ts',
    bad: 'console.log(process.env.PAGESPEED_API_KEY);',
    good: 'console.log(Boolean(process.env.PAGESPEED_API_KEY));',
  },
  'one-redis-command-per-request': {
    file: 'api/sample.ts',
    bad: "declare const redis: { get(k: string): Promise<unknown> };\nexport const r = (keys: string[]) => Promise.all(keys.map((k) => redis.get(k)));",
    good: "declare const redis: { mget(...k: string[]): Promise<unknown> };\nexport const r = (keys: string[]) => redis.mget(...keys);",
  },
  'page-visitor-hashes': {
    file: 'api/sample.ts',
    bad: "import { redis, CLIENTS_KEY } from './_shared.js';\nexport const all = await redis.hgetall(CLIENTS_KEY);",
    good: "import { CLIENTS_KEY } from './_shared.js';\nimport { readHashInPages } from './_hashScan.js';\nexport const all = await readHashInPages(CLIENTS_KEY);",
  },
};

const eslint = new ESLint({ cwd: process.cwd() });

async function writtenFindings(file: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath: file });
  return result.messages.map((message) => message.ruleId ?? `fatal: ${message.message}`).filter((id) => id.startsWith('written/') || id.startsWith('fatal'));
}

describe('written rules', () => {
  it('has a sample for every rule', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(WRITTEN_RULES.map((rule) => rule.id).sort());
  });

  for (const rule of WRITTEN_RULES) {
    it(`${rule.id} fails the bad sample and passes the good one`, async () => {
      const sample = SAMPLES[rule.id];
      const bad = await writtenFindings(sample.file, sample.bad);
      expect(bad.length).toBeGreaterThan(0);
      expect(new Set(bad)).toEqual(new Set([`written/${rule.id}`]));
      expect(await writtenFindings(sample.file, sample.good)).toEqual([]);
    });
  }
});
