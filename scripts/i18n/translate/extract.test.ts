import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { en } from '../../../src/i18n/catalogs/en';
import { tierOf } from '../../../src/i18n/tiers';
import type { MessageKey } from '../../../src/i18n/types';

interface Entry {
  key: string;
  source: string;
  tier: string;
  placeholders: string[];
  plural: boolean;
  sites: { file: string; line: number; slot: string; code: string }[];
  enHash: string;
  contextHash: string;
  unreferenced?: true;
}

const doc = JSON.parse(readFileSync('docs/i18n/source.json', 'utf8')) as { entries: Entry[] };
const byKey = new Map(doc.entries.map((e) => [e.key, e]));

describe('translation corpus', () => {
  it('covers every key that is not sourced from the games', () => {
    const expected = (Object.keys(en) as MessageKey[]).filter((k) => tierOf(k) !== 'official');
    expect(
      expected.filter((k) => !byKey.has(k)),
      'run `npm run i18n:extract` — docs/i18n/source.json is behind the catalog',
    ).toEqual([]);
    expect(doc.entries.filter((e) => !(e.key in en)).map((e) => e.key)).toEqual([]);
  });

  it('carries the current English for every key', () => {
    const stale = doc.entries.filter((e) => e.source !== (en as Record<string, string>)[e.key]);
    expect(stale.map((e) => e.key), 'source.json holds English that has since changed').toEqual([]);
  });
});
