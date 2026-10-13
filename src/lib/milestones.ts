import type { NoArgKey } from '@/i18n';
/**
 * Milestone ladder — the spine of the engagement loop (see
 * docs/ux/engagement-strategy.md). Crossing a count threshold celebrates and,
 * for some, unlocks a feature. Unlocks are STICKY: they key off the highest
 * count ever reached (`milestoneMax` in the store), so removing Pokémon never
 * re-locks a feature the user already earned.
 */

export const DEX_TOTAL = 151;

type MilestoneFeature = 'analytics' | 'view' | 'stats' | 'complete';

interface MilestoneDef {
  /** Count at which this milestone triggers. */
  at: number;
  feature: MilestoneFeature;
  /** Short line shown in the unlock celebration. */
  /** Catalog key rather than text: milestone copy is user-facing. */
  titleKey: NoArgKey;
  /** One-liner elaborating the moment. */
  detailKey: NoArgKey;
}

const MILESTONE_DEFS: readonly MilestoneDef[] = [
  { at: 25, feature: 'analytics', titleKey: 'milestone.25.title', detailKey: 'milestone.25.detail' },
  { at: 100, feature: 'stats', titleKey: 'milestone.100.title', detailKey: 'milestone.100.detail' },
  { at: DEX_TOTAL, feature: 'complete', titleKey: 'milestone.151.title', detailKey: 'milestone.151.detail' },
] as const;

/** Just the threshold numbers, ascending — the progress-bar tick positions. */
export const MILESTONES: readonly number[] = MILESTONE_DEFS.map((m) => m.at);

export const ANALYTICS_UNLOCK_AT = 25;

export const isAnalyticsUnlocked = (milestoneMax: number) => milestoneMax >= ANALYTICS_UNLOCK_AT;

/** Milestone thresholds already reached at a given count — used to pre-seed an
 *  existing user's "celebrated" set on hydrate so restored progress never
 *  fires a retroactive celebration. */
export function milestonesAtOrBelow(count: number): number[] {
  return MILESTONES.filter((m) => count <= 0 ? false : m <= count);
}

