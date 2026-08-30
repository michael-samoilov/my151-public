import { afterEach, describe, expect, it, vi } from 'vitest';
import { warmImages } from './warmImages';

/**
 * The warm-up runs in a node test, where `Image` does not exist, so the guard
 * is what these cover: no constructor, no throw, and no repeat fetch of a URL
 * already warmed this page load.
 */

class FakeImage {
  static made: string[] = [];
  src = '';
  decode() {
    FakeImage.made.push(this.src);
    return Promise.resolve();
  }
}

afterEach(() => {
  FakeImage.made = [];
  Reflect.deleteProperty(globalThis, 'Image');
});

describe('warmImages', () => {
  it('does nothing where there is no Image constructor', () => {
    expect(() => warmImages(['/sprites/pokemon/1.png'])).not.toThrow();
  });

  it('fetches each url once per page load', () => {
    vi.stubGlobal('Image', FakeImage);
    warmImages(['/warm-test/a.png', '/warm-test/b.png', '/warm-test/a.png']);
    warmImages(['/warm-test/a.png']);
    expect(FakeImage.made).toEqual(['/warm-test/a.png', '/warm-test/b.png']);
  });

  it('swallows a sprite that will not decode', async () => {
    class Broken extends FakeImage {
      override decode() {
        return Promise.reject(new Error('undecodable'));
      }
    }
    vi.stubGlobal('Image', Broken);
    expect(() => warmImages(['/warm-test/broken.png'])).not.toThrow();
    await Promise.resolve();
  });
});
