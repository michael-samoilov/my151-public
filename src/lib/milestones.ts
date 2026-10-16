import type { NoArgKey } from '@/i18n';
export const DEX_TOTAL = 151;

type MilestoneFeature = 'analytics' | 'view' | 'stats' | 'complete';

interface MilestoneDef {
  at: number;
  feature: MilestoneFeature;
  titleKey: NoArgKey;
  detailKey: NoArgKey;
}

const MILESTONE_DEFS: readonly MilestoneDef[] = [
  { at: 25, feature: 'analytics', titleKey: 'milestone.25.title', detailKey: 'milestone.25.detail' },
  { at: 100, feature: 'stats', titleKey: 'milestone.100.title', detailKey: 'milestone.100.detail' },
  { at: DEX_TOTAL, feature: 'complete', titleKey: 'milestone.151.title', detailKey: 'milestone.151.detail' },
] as const;

export const MILESTONES: readonly number[] = MILESTONE_DEFS.map((m) => m.at);

export const ANALYTICS_UNLOCK_AT = 25;

export const isAnalyticsUnlocked = (milestoneMax: number) => milestoneMax >= ANALYTICS_UNLOCK_AT;

export function milestonesAtOrBelow(count: number): number[] {
  return MILESTONES.filter((m) => count <= 0 ? false : m <= count);
}

