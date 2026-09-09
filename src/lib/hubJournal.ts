import { HAS_DEX, HAS_LEAGUE, type JournalEntry } from '../../api/_events';

/**
 * The hub views, folded out of the raw funnel journal that `/api/journal`
 * returns.
 *
 * The hub is the one surface with no per-user record: someone who reads it and
 * leaves exists only as journal entries. Everything here therefore counts
 * distinct browsers (`cid`), never events — a browser that clicked the same
 * card twice is one person who clicked.
 *
 * Kept out of the component so the counting can be tested directly. It is the
 * kind of arithmetic that looks right and is off by a factor of the average
 * click count.
 */

/** UTC day (`YYYY-MM-DD`) of a timestamp, matching the journal's own day keys. */
function dayOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Distinct browsers behind one set of events, and what became of them. */
export interface HubCounts {
  /** Browsers that saw the hub. The client de-dupes `hub-shown` once per
   *  browser, so per day this is closer to "new browsers" than to "visits". */
  shown: number;
  dexClicks: number;
  leagueClicks: number;
  /** The callout in the dex builder that points at the gym leader maker. */
  promoShown: number;
  promoCta: number;
  promoDismiss: number;
  /** Of the browsers counted in `shown`: how many hold a record in each store,
   *  ever — including after the day they saw the hub. */
  becameDex: number;
  becameLeague: number;
  becameBoth: number;
  becameNeither: number;
}

export interface HubDay extends HubCounts {
  day: string;
}

export interface HubViews {
  days: HubDay[];
  /** The same counts over the whole window, distinct across it — not the sum
   *  of the days, which would count a returning browser once per day. */
  totals: HubCounts;
}

/** The events each counter draws on. One list, so a renamed event breaks in
 *  one place rather than silently zeroing a column. */
const EVENT_OF = {
  shown: 'hub-shown',
  dexClicks: 'hub-cta-dex',
  leagueClicks: 'hub-cta-league',
  promoShown: 'league-promo-shown',
  promoCta: 'league-promo-cta',
  promoDismiss: 'league-promo-dismiss',
} as const;

type CountKey = keyof typeof EVENT_OF;
const COUNT_KEYS = Object.keys(EVENT_OF) as CountKey[];

type Buckets = Record<CountKey, Set<string>>;
const emptyBuckets = (): Buckets =>
  Object.fromEntries(COUNT_KEYS.map((k) => [k, new Set<string>()])) as Buckets;

function counts(b: Buckets, membership: Record<string, number>): HubCounts {
  let becameDex = 0;
  let becameLeague = 0;
  let becameBoth = 0;
  let becameNeither = 0;
  for (const cid of b.shown) {
    const m = membership[cid] ?? 0;
    const dex = (m & HAS_DEX) !== 0;
    const league = (m & HAS_LEAGUE) !== 0;
    if (dex && league) becameBoth += 1;
    else if (dex) becameDex += 1;
    else if (league) becameLeague += 1;
    else becameNeither += 1;
  }
  return {
    shown: b.shown.size,
    dexClicks: b.dexClicks.size,
    leagueClicks: b.leagueClicks.size,
    promoShown: b.promoShown.size,
    promoCta: b.promoCta.size,
    promoDismiss: b.promoDismiss.size,
    becameDex,
    becameLeague,
    becameBoth,
    becameNeither,
  };
}

export function hubViews(
  entries: JournalEntry[],
  membership: Record<string, number> = {},
): HubViews {
  const byDay = new Map<string, Buckets>();
  const window = emptyBuckets();
  for (const e of entries) {
    const key = COUNT_KEYS.find((k) => EVENT_OF[k] === e.ev);
    if (!key) continue;
    const day = dayOf(e.t);
    let b = byDay.get(day);
    if (!b) byDay.set(day, (b = emptyBuckets()));
    b[key].add(e.cid);
    window[key].add(e.cid);
  }
  return {
    days: [...byDay.entries()]
      .sort((a, b) => (a[0] < b[0] ? -1 : 1))
      .map(([day, b]) => ({ day, ...counts(b, membership) })),
    totals: counts(window, membership),
  };
}

/** Entries per day for the last `n` days of the window, newest last, and the
 *  most recent day the per-day cap discarded events. */
export function journalHealth(
  days: { day: string; count: number; capped: boolean }[],
  n = 7,
): { recent: { day: string; count: number }[]; lastCappedDay: string | null } {
  const sorted = [...days].sort((a, b) => (a.day < b.day ? -1 : 1));
  const capped = sorted.filter((d) => d.capped);
  return {
    recent: sorted.slice(-n).map(({ day, count }) => ({ day, count })),
    lastCappedDay: capped.length > 0 ? capped[capped.length - 1].day : null,
  };
}
