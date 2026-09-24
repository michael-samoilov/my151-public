import { describe, expect, it } from 'vitest';
import { LEAGUE_PERSIST_VERSION, previewLeagueSeed } from './seedLeague';

describe('preview Kanto seed', () => {
  it('writes the persist version the store hydrates', () => {
    expect(previewLeagueSeed().version).toBe(LEAGUE_PERSIST_VERSION);
    expect(LEAGUE_PERSIST_VERSION).toBe(3);
  });

  it('grandfathers the card-export nudge so a full Kanto template does not pop it', () => {
    expect(previewLeagueSeed().state.celebratedNudges).toEqual(['card']);
  });
});
