/**
 * What people pick in the gym leader maker, for the admin picks page.
 *
 * The unit is a league: each browser's current league (`latestCards`) votes
 * once per Pokémon per section, however many cards repeat it. That is the
 * dex picks page's unit too, where a browser's dex votes once per section.
 *
 * A seat stands for the member its line fields at the boss row. A plain
 * placement seats the path from the base form to the tapped Pokémon, so that
 * is the tapped Pokémon. An ace or partner pick seats the whole line and
 * pushes the later stages off the card, so it is the picked stage again.
 *
 * Pure, so src/lib/leaguePicks.test.ts drives it without Redis.
 */
import { LEAGUE_BOSS_ROW, type LeagueCardShape, type LeagueLineShape, type LeagueRecord } from './_leagueRecord.js';

/** `[pokemonId, leagues]`, most leagues first, then lowest id. */
export type LeaguePickRows = [string, number][];

export interface LeaguePicks {
  /** Each league's aces, across every card. */
  ace: LeaguePickRows;
  /**
   * Each league's seated Pokémon, by the card's chosen type. `none` is the
   * explicit "no type" choice. A card with no type chosen is in no section.
   */
  byType: Record<string, LeaguePickRows>;
}

/** The member a seated line fields at the boss row. */
function fieldedMember(line: LeagueLineShape): number {
  if (!line.bd) return line.b[line.b.length - 1];
  let stage = 0;
  for (let i = 1; i < line.b.length; i++) {
    if (line.bd[i] <= LEAGUE_BOSS_ROW) stage = i;
  }
  return line.b[stage];
}

/** The ace a card shows. Mirrors `signatureMember` in src/league/model/engine.ts. */
function aceMember(card: LeagueCardShape): number | null {
  if (card.ace === undefined) return null;
  const line = card.l[card.ace - 1];
  if (!line) return null;
  if (card.aceId !== undefined && line.b.includes(card.aceId)) return card.aceId;
  return fieldedMember(line);
}

function ranked(counts: Map<number, number>): LeaguePickRows {
  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])
    .map(([id, n]) => [String(id), n]);
}

export function leaguePicks(records: readonly Pick<LeagueRecord, 'latestCards'>[]): LeaguePicks {
  const ace = new Map<number, number>();
  const byType = new Map<string, Map<number, number>>();
  const bump = (counts: Map<number, number>, ids: Set<number>) => {
    for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  };

  for (const r of records) {
    const aces = new Set<number>();
    const seated = new Map<string, Set<number>>();
    for (const card of r.latestCards ?? []) {
      const a = aceMember(card);
      if (a !== null) aces.add(a);
      if (card.t === undefined) continue;
      let ids = seated.get(card.t);
      if (!ids) seated.set(card.t, (ids = new Set()));
      for (const line of card.l) ids.add(fieldedMember(line));
    }
    bump(ace, aces);
    for (const [type, ids] of seated) {
      let counts = byType.get(type);
      if (!counts) byType.set(type, (counts = new Map()));
      bump(counts, ids);
    }
  }

  const out: LeaguePicks = { ace: ranked(ace), byType: {} };
  for (const [type, counts] of byType) {
    if (counts.size > 0) out.byType[type] = ranked(counts);
  }
  return out;
}
