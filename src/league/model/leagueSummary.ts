import type { LeagueCardShape, LeagueLineShape, LeagueSummary } from '../../../api/_leagueRecord';
import type { GymCard } from '../store/useLeagueStore';
import { defaultBoundaries, effectiveBoundaries } from './engine';
import { legendsOf, powerupAt } from '../store/useLeagueStore';
import { POWERUP_ROWS } from './powerups';

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

export function describeLeague(cards: GymCard[]): LeagueCardShape[] {
  const out: LeagueCardShape[] = [];
  for (const [i, c] of cards.entries()) {
    if (c.lines.length === 0) continue;
    const lines: LeagueLineShape[] = c.lines.map((line) => {
      const shape: LeagueLineShape = { b: [...line.branch] };
      const fallback = defaultBoundaries(line.branch);
      const boundaries = effectiveBoundaries(line);
      if (boundaries.some((row, stage) => row !== fallback[stage])) {
        shape.bd = [...boundaries];
      }
      if (line.shiny) shape.s = 1;
      return shape;
    });
    const card: LeagueCardShape = { i, l: lines };
    if (c.type) card.t = c.type;
    if (c.signatureSeat !== null) card.ace = c.signatureSeat;
    if (c.signatureId != null) card.aceId = c.signatureId;
    if (c.partnerId != null) card.pa = c.partnerId;
    if (c.tmMoveId != null) card.tm = c.tmMoveId;

    const legends = legendsOf(c);
    if (legends.length > 0) {
      card.lg = legends.map((l): [number, number, 1?] => (l.shiny ? [l.seat, l.pokemonId, 1] : [l.seat, l.pokemonId]));
    }

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
