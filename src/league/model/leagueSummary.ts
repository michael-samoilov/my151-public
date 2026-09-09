import type { LeagueCardShape, LeagueLineShape, LeagueSummary } from '../../../api/_leagueRecord';
import type { GymCard } from '../store/useLeagueStore';
import { defaultBoundaries } from './engine';
import { legendsOf, powerupAt } from '../store/useLeagueStore';
import { POWERUP_ROWS } from './powerups';

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

/**
 * A league's structure, for the analytics record: which lines sit on which
 * card, where the user pulled a stage, and the powerups and legendaries.
 *
 * Deliberately excludes every piece of typed text — the badge name, the theme
 * and the league name. `summarizeLeague` still counts them, so the dashboard
 * knows a card was named without holding what it was named. Free text is
 * where a person writes about themselves; a Pokemon id is not.
 *
 * Empty cards are omitted, so an untouched league is an empty array.
 */
export function describeLeague(cards: GymCard[]): LeagueCardShape[] {
  const out: LeagueCardShape[] = [];
  for (const [i, c] of cards.entries()) {
    if (c.lines.length === 0) continue;
    const lines: LeagueLineShape[] = c.lines.map((line) => {
      const shape: LeagueLineShape = { b: [...line.branch] };
      // Send boundaries only when the user moved one. Their absence says the
      // line evolves where the level curve puts it, and the default is
      // computed here — the server cannot tell adjusted from default alone.
      const fallback = defaultBoundaries(line.branch);
      if (line.boundaries.some((row, stage) => row !== fallback[stage])) {
        shape.bd = [...line.boundaries];
      }
      return shape;
    });
    const card: LeagueCardShape = { i, l: lines };
    if (c.type) card.t = c.type;
    if (c.signatureSeat !== null) card.ace = c.signatureSeat;
    if (c.signatureId != null) card.aceId = c.signatureId;
    if (c.partnerId != null) card.pa = c.partnerId;
    if (c.tmMoveId != null) card.tm = c.tmMoveId;

    // Read through legendsOf and powerupAt, never the raw fields: a card saved
    // before either could hold more than one carries the older single-value
    // shape, and those helpers fold it in.
    const legends = legendsOf(c);
    if (legends.length > 0) {
      card.lg = legends.map((l): [number, number] => [l.seat, l.pokemonId]);
    }

    // One powerup per row, and the champion and endgame rows can differ.
    const pw: [number, number, number, number][] = [];
    for (const row of POWERUP_ROWS) {
      const p = powerupAt(c, row);
      if (p) pw.push([row, p.seat, p.index, p.kind === 'mega' ? 0 : 1]);
    }
    if (pw.length > 0) card.pw = pw;

    out.push(card);
  }
  return out;
}
