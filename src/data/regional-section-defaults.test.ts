import { describe, expect, it } from 'vitest';
import { fitLabel, getSectionLabelChain, measureLabelWidth } from '@/lib/sectionOutlines';

describe('regional section defaults', () => {
  it('keeps Early Bug on a one-tile outline instead of falling to Bug', () => {
    const chain = getSectionLabelChain('early-bug');
    const fontPx = 10;
    const avail = measureLabelWidth('Early Bug', fontPx) * 0.6;
    expect(fitLabel(chain, avail, fontPx).text).toBe('Early Bug');
  });
});
