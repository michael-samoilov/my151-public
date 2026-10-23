import { HAS_DEX, HAS_LEAGUE, HAS_FAVORITES, type JournalEntry } from '../../api/_events';

function dayOf(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

interface HubCounts {
  shown: number;
  dexClicks: number;
  leagueClicks: number;
  favoriteClicks: number;
  promoShown: number;
  promoCta: number;
  promoDismiss: number;
  becameDex: number;
  becameLeague: number;
  becameBoth: number;
  becameFavorites: number;
  outcomes: Record<string, number>;
  becameNeither: number;
}

interface HubDay extends HubCounts {
  day: string;
}

interface HubViews {
  days: HubDay[];
  totals: HubCounts;
}

const EVENT_OF = {
  shown: 'hub-shown',
  dexClicks: 'hub-cta-dex',
  leagueClicks: 'hub-cta-league',
  favoriteClicks: 'hub-cta-favorites',
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
  let becameFavorites = 0;
  const outcomes: Record<string, number> = {};
  for (const cid of b.shown) {
    const m = membership[cid] ?? 0;
    const dex = (m & HAS_DEX) !== 0;
    const league = (m & HAS_LEAGUE) !== 0;
    const favorite = (m & HAS_FAVORITES) !== 0;
    if (favorite) becameFavorites += 1;
    const tools = [dex ? 'dex' : '', favorite ? 'favorites' : '', league ? 'league' : ''].filter(Boolean);
    const key = tools.join('+') || 'neither';
    outcomes[key] = (outcomes[key] ?? 0) + 1;
    if (dex && league) becameBoth += 1;
    else if (dex) becameDex += 1;
    else if (league) becameLeague += 1;
    else if (!favorite) becameNeither += 1;
  }
  return {
    shown: b.shown.size,
    dexClicks: b.dexClicks.size,
    leagueClicks: b.leagueClicks.size,
    favoriteClicks: b.favoriteClicks.size,
    promoShown: b.promoShown.size,
    promoCta: b.promoCta.size,
    promoDismiss: b.promoDismiss.size,
    becameDex,
    becameLeague,
    becameBoth,
    becameNeither,
    becameFavorites,
    outcomes,
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
