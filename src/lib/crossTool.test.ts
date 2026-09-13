import { describe, expect, it } from 'vitest';
import {
  LEAGUE_LAUNCH_TS,
  TOOL_CATALOG,
  buildCrossTool,
  eraBounds,
  multiToolEras,
  leagueIsDexNative,
  seatedPokemonIds,
  type DexLike,
  type LeagueLike,
  type ToolDef,
} from '../../api/_crossTool';
import type { LeagueCardShape } from '../../api/_leagueRecord';

const LAUNCH = LEAGUE_LAUNCH_TS;
const PRE = Date.UTC(2026, 6, 1); // 1 Jul, before launch
const POST = Date.UTC(2026, 8, 9); // 9 Sep, after launch

const dex = (cid: string, firstTs: number, lastTs: number, latestIds: number[] = [1]): DexLike => ({
  cid,
  firstTs,
  lastTs,
  latestIds,
});

const league = (
  cid: string,
  firstTs: number,
  lastTs: number,
  over: Partial<LeagueLike> = {},
): LeagueLike => ({
  cid,
  firstTs,
  lastTs,
  latest: { seats: 1 },
  latestCards: [{ i: 0, l: [{ b: [1] }] }],
  ...over,
});

function kpi(snap: ReturnType<typeof buildCrossTool>, key: string) {
  const row = snap.kpis.find((k) => k.key === key);
  if (!row) throw new Error(`missing kpi ${key}: ${snap.kpis.map((k) => k.key).join(',')}`);
  return row;
}

describe('eraBounds', () => {
  it('cuts once per tool after the first', () => {
    const bounds = eraBounds(TOOL_CATALOG);
    expect(bounds.map((b) => b.key)).toEqual(['before-league', 'since-league']);
    expect(bounds.map((b) => b.shortLabel)).toEqual(['Before 8 Sep', 'After 8 Sep']);
    expect(bounds[0].until).toBe(LAUNCH);
    expect(bounds[1].since).toBe(LAUNCH);
  });

  it('opens a new era when a later tool is added to the catalog', () => {
    const catalog: ToolDef[] = [
      ...TOOL_CATALOG,
      { id: 'fav', label: 'Favourites', short: 'Fav', launchedAt: Date.UTC(2026, 10, 1) },
    ];
    expect(eraBounds(catalog)).toHaveLength(3);
    expect(eraBounds(catalog).map((b) => b.key)).toEqual([
      'before-league',
      'before-fav',
      'since-fav',
    ]);
    expect(eraBounds(catalog).map((b) => b.shortLabel)).toEqual([
      'Before 8 Sep',
      '8 Sep to 1 Nov',
      'After 1 Nov',
    ]);
  });
});

describe('multiToolEras', () => {
  it('drops the era before a second tool existed', () => {
    expect(multiToolEras(eraBounds(TOOL_CATALOG)).map((b) => b.key)).toEqual(['since-league']);
  });

  it('keeps every cut after the second tool, so a third tool gets two Venns', () => {
    const catalog: ToolDef[] = [
      ...TOOL_CATALOG,
      { id: 'fav', label: 'Favourites', short: 'Fav', launchedAt: Date.UTC(2026, 10, 1) },
    ];
    expect(multiToolEras(eraBounds(catalog)).map((b) => b.key)).toEqual(['before-fav', 'since-fav']);
  });
});

describe('buildCrossTool conversion', () => {
  it('does not put a pre-launch dex-only browser in the denominator', () => {
    const snap = buildCrossTool(
      [dex('gone', PRE, PRE), dex('stayed', PRE, POST)],
      [],
    );
    const conv = kpi(snap, 'dex-to-league');
    expect(conv.of).toBe(1);
    expect(conv.n).toBe(0);
    expect(conv.pct).toBe(0);
  });

  it('counts a dual-tool browser whose dex lastTs is still pre-launch', () => {
    // They opened league without sending a new dex beacon. They had a chance.
    const snap = buildCrossTool(
      [dex('both', PRE, PRE)],
      [league('both', POST, POST)],
    );
    const conv = kpi(snap, 'dex-to-league');
    expect(conv).toMatchObject({ n: 1, of: 1, pct: 100 });
  });

  it('uses opportunity, not all dex users, as the conversion percent', () => {
    const snap = buildCrossTool(
      [
        dex('pre-only', PRE, PRE),
        dex('pre-only-2', PRE, PRE),
        dex('returner', PRE, POST),
        dex('dual', PRE, POST),
        dex('new', POST, POST),
      ],
      [
        league('dual', POST, POST),
        league('league-only', POST, POST),
      ],
    );
    // Eligible: returner, dual, new. Not the two pre-only. Not league-only.
    expect(kpi(snap, 'dex-to-league')).toMatchObject({ n: 1, of: 3, pct: 33 });
    expect(kpi(snap, 'league-has-earlier')).toMatchObject({ n: 1, of: 2, pct: 50 });
  });

  it('unions country-split dex records onto one browser', () => {
    const snap = buildCrossTool(
      [dex('aaa::US', PRE, PRE, [4]), dex('aaa::JP', POST, POST, [7])],
      [league('aaa', POST, POST)],
    );
    expect(kpi(snap, 'dex-to-league')).toMatchObject({ n: 1, of: 1, pct: 100 });
    expect(snap.eras.find((e) => e.key === 'before-league')?.browsers).toBe(1);
  });
});

describe('buildCrossTool eras', () => {
  it('puts first-seen-before-launch browsers in the pre era, including later league overlap', () => {
    const snap = buildCrossTool(
      [dex('pre', PRE, PRE), dex('came-back', PRE, POST)],
      [league('came-back', POST, POST), league('fresh', POST, POST)],
    );
    const pre = snap.eras.find((e) => e.key === 'before-league')!;
    const post = snap.eras.find((e) => e.key === 'since-league')!;
    expect(pre.regions).toEqual({ dex: 1, 'dex+league': 1 });
    expect(post.regions).toEqual({ league: 1 });
    expect(pre.browsers + post.browsers).toBe(3);
  });
});

describe('seatedPokemonIds', () => {
  const cards: LeagueCardShape[] = [
    {
      i: 0,
      l: [{ b: [4, 5, 6] }],
      aceId: 6,
      pa: 25,
      tm: 15,
      lg: [[1, 150]],
      pw: [[2, 1, 3, 0]],
    },
  ];

  it('keeps line members, ace, partner, and legendaries', () => {
    expect(seatedPokemonIds(cards).sort((a, b) => a - b)).toEqual([4, 5, 6, 25, 150]);
  });

  it('drops TM ids and power-up form indices', () => {
    expect(seatedPokemonIds(cards)).not.toContain(15);
    expect(seatedPokemonIds(cards)).not.toContain(3);
  });
});

describe('leagueIsDexNative', () => {
  it('treats the rest of an evolution line as in-dex', () => {
    // Charmander in the dex, the whole Charmander line on the board.
    expect(leagueIsDexNative([4], [4, 5, 6])).toBe(true);
  });

  it('rejects a family the dex does not have', () => {
    expect(leagueIsDexNative([4], [1])).toBe(false);
  });

  it('is false for an empty league', () => {
    expect(leagueIsDexNative([4], [])).toBe(false);
  });
});

describe('League ⊂ dex KPI', () => {
  it('counts a known native league and reports an unknown stored-team gap', () => {
    const snap = buildCrossTool(
      [dex('native', PRE, POST, [4]), dex('unknown', PRE, POST, [1]), dex('foreign', PRE, POST, [4])],
      [
        league('native', POST, POST, { latestCards: [{ i: 0, l: [{ b: [4, 5, 6] }] }] }),
        league('unknown', POST, POST, { latest: { seats: 6 }, latestCards: undefined }),
        league('foreign', POST, POST, { latestCards: [{ i: 0, l: [{ b: [1] }] }] }),
      ],
    );
    const row = kpi(snap, 'league-from-dex');
    expect(row).toMatchObject({ n: 1, of: 2, pct: 50 });
    expect(row.hint).toMatch(/1 missing a stored team/);
  });

  it('skips an empty league rather than calling it native', () => {
    const snap = buildCrossTool(
      [dex('empty', PRE, POST, [4])],
      [league('empty', POST, POST, { latest: { seats: 0 }, latestCards: [] })],
    );
    expect(snap.kpis.find((k) => k.key === 'league-from-dex')).toBeUndefined();
  });
});
