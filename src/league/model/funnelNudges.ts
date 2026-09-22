import { BOSS_ROW, SLOT_COUNT, TEAM_SIZES, slotKind } from './constants';
import { leagueNudgeEvent, type LeagueNudgeAction, type LeagueNudgeId } from '../../../api/_events';

/**
 * League-builder export nudges. Same job as the dex builder's milestone-151
 * popup: when a unit of work is done, point at Export. Thresholds live here
 * so the store, the popup, and the tests share one reading of "full".
 */

export type { LeagueNudgeAction, LeagueNudgeId };

export const GYM_LEADER_SLOTS = [...Array(SLOT_COUNT).keys()].filter(
  (i) => slotKind(i) === 'gym',
).length;

export const CARD_LINE_CAP = TEAM_SIZES[BOSS_ROW - 1];

export { leagueNudgeEvent };

export function cardHasFullTeam(card: { lines: readonly unknown[] }): boolean {
  return card.lines.length >= CARD_LINE_CAP;
}

export function gymLeaderSlotsFilled(cards: readonly { lines: readonly unknown[] }[]): number {
  return cards.slice(0, GYM_LEADER_SLOTS).filter((c) => c.lines.length > 0).length;
}

export function reachedNudges(
  cards: readonly { lines: readonly unknown[] }[],
): LeagueNudgeId[] {
  const out: LeagueNudgeId[] = [];
  if (cards.some(cardHasFullTeam)) out.push('card');
  if (gymLeaderSlotsFilled(cards) >= GYM_LEADER_SLOTS) out.push('league');
  return out;
}

export interface LeagueNudgeContext {
  cards: readonly { lines: readonly unknown[] }[];
  celebrated: readonly LeagueNudgeId[];
  openCard: number | null;
  browserOpen: boolean;
  exportOpen: boolean;
}

/**
 * Which popup to show right now. One at a time. A full trainer card wins
 * while that card is open; the gym-roster nudge waits for league home.
 * The picker and the export overlay both hide it, matching the dex
 * celebration that waits out the mobile sheet.
 */
export function nextLeagueNudge(ctx: LeagueNudgeContext): LeagueNudgeId | null {
  if (ctx.browserOpen || ctx.exportOpen) return null;
  const fresh = reachedNudges(ctx.cards).filter((id) => !ctx.celebrated.includes(id));
  if (fresh.includes('card') && ctx.openCard !== null) {
    const open = ctx.cards[ctx.openCard];
    if (open && cardHasFullTeam(open)) return 'card';
  }
  if (fresh.includes('league') && ctx.openCard === null) return 'league';
  return null;
}

export function isLeagueNudgeId(v: unknown): v is LeagueNudgeId {
  return v === 'card' || v === 'league';
}

export function parseCelebratedNudges(v: unknown): LeagueNudgeId[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isLeagueNudgeId);
}
