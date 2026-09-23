import { describe, expect, it } from 'vitest';
import { minimapViewportX } from '../model/minimap';

describe('minimap viewport', () => {
  it('shows the same bounded bounce beyond either horizontal edge', () => {
    expect(minimapViewportX(-100, 0.1, 84, 24)).toBe(-8);
    expect(minimapViewportX(0, 0.1, 84, 24)).toBe(0);
    expect(minimapViewportX(600, 0.1, 84, 24)).toBe(60);
    expect(minimapViewportX(700, 0.1, 84, 24)).toBe(68);
  });
});
