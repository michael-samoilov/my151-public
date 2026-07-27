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

  it('handles adjacent slots', () => {
    expect(splitTemplate('{a}{b}')).toEqual([
      { kind: 'slot', name: 'a' },
      { kind: 'slot', name: 'b' },
    ]);
  });

  it('handles a template with no slots', () => {
    expect(splitTemplate('perfectly balanced dex')).toEqual([
      { kind: 'literal', text: 'perfectly balanced dex' },
    ]);
  });

  it('is not stateful across calls', () => {
    // The module-level regex is /g; forgetting to reset lastIndex would make
    // every other call return garbage.
    const once = splitTemplate('{a} and {b}');
    expect(splitTemplate('{a} and {b}')).toEqual(once);
    expect(splitTemplate('{a} and {b}')).toEqual(once);
  });

  it('lets a translation reorder the slots', () => {
    // The whole point: word order is the translator's to change.
    const parts = splitTemplate('{attack}が{types}より強い');
    expect(parts.map((p) => (p.kind === 'slot' ? `<${p.name}>` : p.text)).join('')).toBe(
      '<attack>が<types>より強い',
    );
  });
});

describe('expandTemplate', () => {
  const lit = (text: string) => ({ t: text });

  it('interleaves rendered slots with literals', () => {
    expect(
      expandTemplate('{type} over-performs', lit, { type: () => [{ t: 'FIRE' }] }),
    ).toEqual([{ t: 'FIRE' }, { t: ' over-performs' }]);
  });

  it('lets one slot expand to several pieces', () => {
    // A type slot becomes an icon plus coloured text on the poster.
    expect(
      expandTemplate('{types}-forward', lit, { types: () => [{ t: 'icon' }, { t: 'Water' }] }),
    ).toEqual([{ t: 'icon' }, { t: 'Water' }, { t: '-forward' }]);
  });

  it('emits an unknown slot verbatim rather than dropping it', () => {
    // A visible {type} gets reported; a silently missing subject does not.
    expect(expandTemplate('{missing} here', lit, {})).toEqual([
      { t: '{missing}' },
      { t: ' here' },
    ]);
  });
});
