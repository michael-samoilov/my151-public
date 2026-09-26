import { describe, expect, it } from 'vitest';
import { parseHoverTiltRecipe } from './hoverTiltRecipe';

describe('hover-tilt recipe', () => {
  it('drops unknown keys and clamps at the parse boundary', () => {
    const parsed = parseHoverTiltRecipe({
      tiltFactor: 99,
      scaleFactor: 0.2,
      glareMask: 'holo-foil',
      sparkleMask: 'wordmark',
      blendMode: 'multiply',
      extra: true,
    });
    expect(parsed.tiltFactor).toBeCloseTo(4);
    expect(parsed.scaleFactor).toBe(1);
    expect(parsed.glareMask).toBe('none');
    expect('sparkleMask' in parsed).toBe(false);
    expect('blendMode' in parsed).toBe(false);
  });
});
