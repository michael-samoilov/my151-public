import { describe, expect, it } from 'vitest';
import { expandTemplate, splitTemplate } from './richTemplate';

describe('splitTemplate', () => {
  it('splits literals and slots in order', () => {
    expect(splitTemplate('{types}-forward')).toEqual([
      { kind: 'slot', name: 'types' },
      { kind: 'literal', text: '-forward' },
    ]);
  });

  it('handles a slot in the middle', () => {
    expect(splitTemplate('made with {app} today')).toEqual([
      { kind: 'literal', text: 'made with ' },
      { kind: 'slot', name: 'app' },
      { kind: 'literal', text: ' today' },
    ]);
  });
});

describe('expandTemplate', () => {
  const lit = (text: string) => ({ t: text });

  it('interleaves rendered slots with literals', () => {
    expect(
      expandTemplate('{type} over-performs', lit, { type: () => [{ t: 'FIRE' }] }),
    ).toEqual([{ t: 'FIRE' }, { t: ' over-performs' }]);
  });
});
