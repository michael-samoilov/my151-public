import { describe, expect, it } from 'vitest';
import { Stars } from './glyphs';

describe('Elite Four stars', () => {
  it('lays four stars on one row', () => {
    const el = Stars({ n: 4 });
    expect(el.props.className).toContain('inline-flex');
    expect(el.props.className).not.toContain('grid-cols-2');
    expect(el.props.children).toHaveLength(4);
  });
});
