import { describe, expect, it } from 'vitest';
import { fitLabel, getSectionLabelChain, measureLabelWidth } from '@/lib/sectionOutlines';

describe('regional section defaults', () => {
  it('never shortens Regional Bug to Bug, which reads as the type, on a one-tile outline', () => {
    const chain = getSectionLabelChain('early-bug');
    const fontPx = 10;
    const avail = measureLabelWidth('Early Bug', fontPx) * 0.6;
    expect(fitLabel(chain, avail, fontPx).text).not.toBe('Bug');
  });
});
