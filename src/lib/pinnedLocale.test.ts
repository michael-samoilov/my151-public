import { describe, expect, it, beforeEach } from 'vitest';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPinnedLocale } from './pinnedLocale';

describe('getPinnedLocale', () => {
  beforeEach(() => {
    usePokedexStore.setState({ locale: null });
  });

  it('is undefined while the visitor still follows the browser', () => {
    expect(getPinnedLocale()).toBeUndefined();
  });

  it('returns the locale the picker pinned', () => {
    usePokedexStore.setState({ locale: 'en' });
    expect(getPinnedLocale()).toBe('en');
  });
});
