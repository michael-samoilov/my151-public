import { describe, expect, it } from 'vitest';
import { isOnScreenAnchor, visibleArea } from './nudgeAnchor';

describe('nudgeAnchor', () => {
  const vw = 390;
  const vh = 844;

  it('rejects a left-edge sliver of Export while the home pane is still panning in', () => {
    // Transform still at -50%: league Export peeks in from the left, which is
    // where the league name will sit once the pan finishes.
    const midPanExport = { left: -30, right: 2, top: 12, bottom: 40 };
    expect(visibleArea(midPanExport, vw, vh)).toBeGreaterThan(0);
    expect(isOnScreenAnchor(midPanExport, vw, vh)).toBe(false);
  });

  it('accepts the settled toolbar Export on the right of a 390px screen', () => {
    const settledExport = { left: 350, right: 382, top: 12, bottom: 40 };
    expect(isOnScreenAnchor(settledExport, vw, vh)).toBe(true);
  });
});
