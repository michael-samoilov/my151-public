import type { LeagueSummary } from '../../../api/_leagueRecord';
import type { GymCard } from '../store/useLeagueStore';

/**
 * A league in counts, for the analytics record. Intent only: how many cards
 * hold a line, how many lines, how many cards are typed, named, or have an
 * ace. No contents — those are the user's.
 */
export function summarizeLeague(name: string, cards: GymCard[]): LeagueSummary {
  let filled = 0;
  let seats = 0;
  let typed = 0;
  let named = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.lines.length > 0) filled += 1;
    seats += c.lines.length;
    if (c.type !== null) typed += 1;
    if (c.badgeName.trim() || c.theme.trim()) named += 1;
    if (c.signatureSeat !== null) aces += 1;
  }
  return { cards: filled, seats, typed, named, aces, leagueNamed: name.trim().length > 0 };
}
