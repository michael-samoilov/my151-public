import { afterEach, describe, expect, it } from 'vitest';
import { en } from './catalogs/en';
import { setCatalog, translatePlural } from './core';
import type { Messages } from './types';

afterEach(() => setCatalog('en', en));

describe('translatePlural', () => {
  const counted = {
    ...en,
    'test.count_one': '{count} line',
    'test.count_other': '{count} lines',
  } as unknown as Messages;

  it('selects English singular and plural', () => {
    setCatalog('en', counted);
    expect(translatePlural('test.count' as never, 1)).toBe('1 line');
    expect(translatePlural('test.count' as never, 0)).toBe('0 lines');
    expect(translatePlural('test.count' as never, 2)).toBe('2 lines');
  });
});
