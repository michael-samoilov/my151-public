const DROP_PREFIXES = {
  dex: 'submit-drop:',
  league: 'league-drop:',
} as const;

type DropTool = keyof typeof DROP_PREFIXES;

export const DROP_TOOL_LABEL: Record<DropTool, string> = {
  dex: 'Dex builder',
  league: 'Gym leader maker',
};

interface DropRow {
  tool: DropTool;
  reason: string;
  count: number;
}

const LEGACY_DROP_REASONS = new Set(['rate-limit']);

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
  'new-client-limit': {
    title: 'Per-network new-browser limit',
    what: 'More than 20 browsers the store had never seen arrived from one network address in one day, so the later ones were not stored. One network is one IPv4 address or one IPv6 /64. Real visitors rarely reach 20 from one network. A script that invents browser IDs to fill the store is the likely cause.',
    reading:
      'Users undercounts by these browsers for that day. People who already had a record keep updating normally, and the same network can add new browsers again the next day.',
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

const NEAR_CAP_PREFIX = 'clients-near-cap:';
const NEAR_CAP_LABEL: Record<string, string> = { ...DROP_TOOL_LABEL, favorites: 'Favorite picker' };

export function nearCapRows(events: Record<string, number> | undefined): { label: string; count: number }[] {
  return Object.entries(events ?? {})
    .filter(([key, count]) => key.startsWith(NEAR_CAP_PREFIX) && count > 0)
    .map(([key, count]) => ({ label: NEAR_CAP_LABEL[key.slice(NEAR_CAP_PREFIX.length)] ?? key, count }));
}
