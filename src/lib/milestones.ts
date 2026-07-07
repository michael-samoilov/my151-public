/**
 * Milestone ladder — the spine of the engagement loop (see
 * docs/ux/engagement-strategy.md). Crossing a count threshold celebrates and,
 * for some, unlocks a feature. Unlocks are STICKY: they key off the highest
 * count ever reached (`milestoneMax` in the store), so removing Pokémon never
 * re-locks a feature the user already earned.
 */

export const DEX_TOTAL = 151;

export type MilestoneFeature = 'analytics' | 'view' | 'stats' | 'complete';

export interface MilestoneDef {
  /** Count at which this milestone triggers. */
  at: number;
  feature: MilestoneFeature;
  /** Short line shown in the unlock celebration. */
  title: string;
  /** One-liner elaborating the moment. */
  detail: string;
}

export const MILESTONE_DEFS: readonly MilestoneDef[] = [
  { at: 25, feature: 'analytics', title: 'Analytics unlocked', detail: 'Your dex has enough shape to analyze — see how it stacks up.' },
  { at: 100, feature: 'stats', title: 'Detailed stats unlocked', detail: 'Type, generation, and base-stat charts are now available in View.' },
  { at: DEX_TOTAL, feature: 'complete', title: 'Your 151 is complete', detail: 'Share it, or keep refining your picks.' },
] as const;

/** Just the threshold numbers, ascending — the progress-bar tick positions. */
export const MILESTONES: readonly number[] = MILESTONE_DEFS.map((m) => m.at);

export const ANALYTICS_UNLOCK_AT = 25;
export const STATS_UNLOCK_AT = 100;

export const isAnalyticsUnlocked = (milestoneMax: number) => milestoneMax >= ANALYTICS_UNLOCK_AT;
export const isStatsUnlocked = (milestoneMax: number) => milestoneMax >= STATS_UNLOCK_AT;

/** Milestone thresholds already reached at a given count — used to pre-seed an
 *  existing user's "celebrated" set on hydrate so restored progress never
 *  fires a retroactive celebration. */
export function milestonesAtOrBelow(count: number): number[] {
  return MILESTONES.filter((m) => count <= 0 ? false : m <= count);
}

/** The next milestone above `count`, or null if the dex is complete. */
export function nextMilestone(count: number): number | null {
  return MILESTONES.find((m) => m > count) ?? null;
}
