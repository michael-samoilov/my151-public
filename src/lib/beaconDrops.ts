/**
 * Server-side beacon drops: which ones are still meaningful, and what each one
 * does to the numbers on the admin dashboard.
 *
 * Kept out of the component so the filtering can be tested directly. The rule
 * it encodes is easy to lose in a refactor and expensive to lose in practice:
 * a retired counter must stop being shown, or the dashboard carries a standing
 * warning about a fixed problem that can never clear itself.
 */

/**
 * The funnel-hash prefix each tool records its drops under: api/submit.ts
 * writes `submit-drop:*`, api/league.ts writes `league-drop:*`.
 *
 * Both tools drop beacons for the same four reasons, so a single combined
 * notice would say "4 dropped for cap" without saying which store lost them —
 * and the two stores fail for different reasons at different times.
 */
export const DROP_PREFIXES = {
  dex: 'submit-drop:',
  league: 'league-drop:',
} as const;

export type DropTool = keyof typeof DROP_PREFIXES;

/** Human label for each tool, for the notice. */
export const DROP_TOOL_LABEL: Record<DropTool, string> = {
  dex: 'Dex builder',
  league: 'Gym leader maker',
};

export interface DropRow {
  tool: DropTool;
  reason: string;
  count: number;
}

/**
 * Reasons retired by a later change. Their counters still hold real history in
 * Redis — nothing deletes them — but nothing increments them either.
 *
 * `rate-limit` predates the split into `rate-limit-ip` / `rate-limit-client`,
 * which exists because one combined bucket could not say which limiter fired.
 * Its 31 recorded drops are from before the cadence/cap fix and are frozen, so
 * showing them reads as an ongoing fault rather than as history.
 */
export const LEGACY_DROP_REASONS = new Set(['rate-limit']);

/** What a live drop reason means, and how it should change your reading of the
 *  numbers above it. The second half is the one that matters: a drop counter is
 *  only useful if you know which stat it makes untrustworthy. */
export const DROP_REASON_INFO: Record<string, { title: string; what: string; reading: string }> = {
  'rate-limit-ip': {
    title: 'Per-network burst limit',
    what: 'More beacons arrived from one IP address within 10 minutes than the shared burst limit allows. Several people behind one network — a school, an office, a mobile carrier — can trip this between them without any one of them doing anything unusual.',
    reading:
      'Users and Active 7d undercount for that window. This is the worst kind of loss: someone whose every beacon was rejected has no record at all, so they are missing entirely rather than merely stale. Expect a flat spot on the chart where traffic actually spiked.',
  },
  'rate-limit-client': {
    title: 'Per-browser daily limit',
    what: 'One browser exceeded its daily beacon allowance. This should not happen in normal use: the allowance is deliberately set above the maximum the app itself can send in a day. Many tabs open at once on one browser, or something calling the endpoint directly, are the likely causes.',
    reading:
      'That person keeps their place in Users, but their later activity that day is gone. Their last-seen time is stale, and their session count and depth are understated. If this appears repeatedly, the allowance needs re-checking against the send rate.',
  },
  cap: {
    title: 'Distinct-browser ceiling',
    what: 'The store reached its maximum number of distinct browsers. Past that point new browsers are ignored, while people already recorded keep updating normally.',
    reading:
      'Users stops growing even as new people arrive, so it becomes a floor rather than a count. Every new-user and growth number after this point understates reality, and the gap widens the longer it stays capped.',
  },
  contention: {
    title: 'Write contention',
    what: 'Several beacons from the same browser tried to update one record at the same moment, and one gave up after retrying. A few of these under bursty traffic are expected.',
    reading:
      'One snapshot was lost. The beacons on either side of it usually captured nearly the same state, so in small numbers this barely moves any stat. A large number would mean the retry budget is too small.',
  },
};

/**
 * Drop reasons worth showing, largest first: the funnel hash filtered to the
 * drop prefixes, with retired reasons and zero counts removed. Pass `tool` to
 * limit it to one store.
 *
 * Zeroes are dropped because a counter that has been created but never
 * incremented is not a fault, and an amber warning reading "0" is noise.
 */
export function liveDropReasons(
  events: Record<string, number> | undefined,
  tool?: DropTool,
): DropRow[] {
  const wanted = tool ? [tool] : (Object.keys(DROP_PREFIXES) as DropTool[]);
  const rows: DropRow[] = [];
  for (const [key, count] of Object.entries(events ?? {})) {
    for (const t of wanted) {
      const prefix = DROP_PREFIXES[t];
      if (!key.startsWith(prefix)) continue;
      const reason = key.slice(prefix.length);
      if (count > 0 && reason !== '' && !LEGACY_DROP_REASONS.has(reason)) {
        rows.push({ tool: t, reason, count });
      }
    }
  }
  return rows.sort((a, b) => b.count - a.count);
}
