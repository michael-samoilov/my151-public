import { describe, expect, it } from 'vitest';
import { FRAME } from '@/league/export/layout';
import { DEX_EXPORT_FRAME, DEX_EXPORT_FRAME_RED } from './exportImage';

describe('dex export frame', () => {
  it('uses the trainer-card FRAME stroke in the same red', () => {
    expect(DEX_EXPORT_FRAME).toBe(FRAME);
    expect(DEX_EXPORT_FRAME).toBe(12);
    expect(DEX_EXPORT_FRAME_RED).toBe('#DC2626');
  });
});
