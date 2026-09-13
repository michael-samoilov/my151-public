import { describe, expect, it } from 'vitest';
import { asArchivedSet, bareCid, isArchived, withoutArchived } from '../../api/_archive';

describe('bareCid', () => {
  it('strips a country suffix', () => {
    expect(bareCid('abc-123::US')).toBe('abc-123');
  });

  it('leaves a plain id alone', () => {
    expect(bareCid('abc-123')).toBe('abc-123');
  });
});

describe('withoutArchived', () => {
  const rows = [{ cid: 'aaaa' }, { cid: 'bbbb::GB' }, { cid: 'cccc' }];

  it('keeps every row when nothing is archived', () => {
    expect(withoutArchived(rows, new Set())).toEqual(rows);
  });

  it('drops a country-split record when its bare id is archived', () => {
    const out = withoutArchived(rows, asArchivedSet(['bbbb']));
    expect(out.map((r) => r.cid)).toEqual(['aaaa', 'cccc']);
  });
});

describe('isArchived', () => {
  const set = asArchivedSet(['bbbb::US']);

  it('matches the bare id', () => {
    expect(isArchived('bbbb', set)).toBe(true);
    expect(isArchived('bbbb::FR', set)).toBe(true);
    expect(isArchived('aaaa', set)).toBe(false);
  });
});
