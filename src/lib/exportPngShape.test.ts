import { describe, expect, it, vi } from 'vitest';
import { clipExportCanvas, EXPORT_CORNER_RADIUS } from './exportPngShape';

describe('export PNG shape', () => {
  it('clips the full logical canvas to the shared radius', () => {
    const beginPath = vi.fn();
    const roundRect = vi.fn();
    const clip = vi.fn();
    const ctx = { beginPath, roundRect, clip } as unknown as CanvasRenderingContext2D;

    clipExportCanvas(ctx, 640, 480);

    expect(beginPath).toHaveBeenCalledOnce();
    expect(roundRect).toHaveBeenCalledWith(0, 0, 640, 480, EXPORT_CORNER_RADIUS);
    expect(clip).toHaveBeenCalledOnce();
    expect(beginPath.mock.invocationCallOrder[0]).toBeLessThan(roundRect.mock.invocationCallOrder[0]!);
    expect(roundRect.mock.invocationCallOrder[0]).toBeLessThan(clip.mock.invocationCallOrder[0]!);
  });
});
