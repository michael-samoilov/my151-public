import { BOSS_ROW, SLOT_COUNT, TEAM_SIZES, slotKind } from './constants';
import {
  leagueNudgeEvent as funnelEventName,
  type LeagueNudgeAction,
  type LeagueNudgeId as LeagueNudgeEventId,
} from '../../../api/_events';

export type LeagueNudgeId = LeagueNudgeEventId | 'complete' | 'full';

const GYM_LEADER_SLOTS = [...Array(SLOT_COUNT).keys()].filter(
  (i) => slotKind(i) === 'gym',
).length;

const CARD_LINE_CAP = TEAM_SIZES[BOSS_ROW - 1];

export function leagueNudgeEvent(id: LeagueNudgeId, action: LeagueNudgeAction) {
  return funnelEventName(id === 'card' ? 'card' : 'league', action);
}

export function cardHasFullTeam(card: { lines: readonly unknown[] }): boolean {
  return card.lines.length >= CARD_LINE_CAP;
}

export function gymLeaderSlotsFilled(cards: readonly { lines: readonly unknown[] }[]): number {
  return cards.slice(0, GYM_LEADER_SLOTS).filter((c) => c.lines.length > 0).length;
}

export function allCardsFilled(cards: readonly { lines: readonly unknown[] }[]): boolean {
  return cards.length >= SLOT_COUNT && cards.slice(0, SLOT_COUNT).every((c) => c.lines.length > 0);
}

export function allCardsHaveFullTeams(cards: readonly { lines: readonly unknown[] }[]): boolean {
  return cards.length >= SLOT_COUNT && cards.slice(0, SLOT_COUNT).every(cardHasFullTeam);
}

export function reachedNudges(
  cards: readonly { lines: readonly unknown[] }[],
): LeagueNudgeId[] {
  const out: LeagueNudgeId[] = [];
  if (cards.some(cardHasFullTeam)) out.push('card');
  if (gymLeaderSlotsFilled(cards) >= GYM_LEADER_SLOTS) out.push('league');
  if (allCardsFilled(cards)) out.push('complete');
  return out;
}

interface LeagueNudgeContext {
  cards: readonly { lines: readonly unknown[] }[];
  celebrated: readonly LeagueNudgeId[];
  openCard: number | null;
  browserOpen: boolean;
  exportOpen: boolean;
}

export function nextLeagueNudge(ctx: LeagueNudgeContext): LeagueNudgeId | null {
  if (ctx.browserOpen || ctx.exportOpen) return null;
  const fresh = reachedNudges(ctx.cards).filter((id) => !ctx.celebrated.includes(id));
  if (fresh.includes('card') && ctx.openCard !== null) {
    const open = ctx.cards[ctx.openCard];
    if (open && cardHasFullTeam(open)) return 'card';
  }
  if (ctx.openCard !== null) return null;
  if (fresh.includes('complete')) return 'complete';
  if (fresh.includes('league') && !ctx.celebrated.includes('complete')) return 'league';
  return null;
}

export function isRosterNudge(id: LeagueNudgeId | null): id is 'league' | 'complete' | 'full' {
  return id === 'league' || id === 'complete' || id === 'full';
}

function isLeagueNudgeId(v: unknown): v is LeagueNudgeId {
  return v === 'card' || v === 'league' || v === 'complete';
}

export function parseCelebratedNudges(v: unknown): LeagueNudgeId[] {
  if (!Array.isArray(v)) return [];
  return v.filter(isLeagueNudgeId);
}
