import { describe, expect, it } from 'vitest';
import { isShareAbort } from './exportImage';

describe('isShareAbort', () => {
  it('treats a share-sheet cancel as abort', () => {
    expect(isShareAbort(new DOMException('Share canceled', 'AbortError'))).toBe(true);
  });

  it('does not treat a failed export as abort', () => {
    expect(isShareAbort(new Error('toBlob failed'))).toBe(false);
    expect(isShareAbort(new DOMException('The operation failed', 'EncodingError'))).toBe(false);
  });
});
