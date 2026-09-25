import { describe, expect, it, vi } from 'vitest';
import { clipExportCanvas, exportCornerRadius } from './exportPngShape';

describe('export PNG shape', () => {
  it('clips the full logical canvas to the shared radius', () => {
    const beginPath = vi.fn();
    const roundRect = vi.fn();
    const clip = vi.fn();
    const ctx = { beginPath, roundRect, clip } as unknown as CanvasRenderingContext2D;

    clipExportCanvas(ctx, 640, 480);

    expect(beginPath).toHaveBeenCalledOnce();
    expect(roundRect).toHaveBeenCalledWith(0, 0, 640, 480, exportCornerRadius(640, 480));
    expect(clip).toHaveBeenCalledOnce();
    expect(beginPath.mock.invocationCallOrder[0]).toBeLessThan(roundRect.mock.invocationCallOrder[0]!);
    expect(roundRect.mock.invocationCallOrder[0]).toBeLessThan(clip.mock.invocationCallOrder[0]!);
  });

  it('scales the corner enough to remain visible on a full-size export', () => {
    expect(exportCornerRadius(888, 1407)).toBeCloseTo(35.52);
    expect(exportCornerRadius(1407, 888)).toBeCloseTo(35.52);
  });
});
