import { LEAGUE_BOSS_ROW, type LeagueCardShape, type LeagueLineShape, type LeagueRecord } from './_leagueRecord.js';

export type LeaguePickRows = [pokemonId: string, leagues: number][];

export interface LeaguePicks {
  ace: LeaguePickRows;
  byType: Record<string, LeaguePickRows>;
}

function fieldedMember(line: LeagueLineShape): number {
  if (!line.bd) return line.b[line.b.length - 1];
  let stage = 0;
  for (let i = 1; i < line.b.length; i++) {
    if (line.bd[i] <= LEAGUE_BOSS_ROW) stage = i;
  }
  return line.b[stage];
}

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
