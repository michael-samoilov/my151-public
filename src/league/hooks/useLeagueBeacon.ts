import { useEffect, useState } from 'react';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { getLocale } from '@/i18n/core';
import { currentPage } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
  type BeaconDebouncer,
} from '@/lib/beaconScheduler';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import type { LeagueCardShape, LeagueExportKind, LeagueSummary } from '../../../api/_leagueRecord';
import { useLeagueStore } from '../store/useLeagueStore';
import { describeLeague, summarizeLeague } from '../model/leagueSummary';

/**
 * The gym leader maker's build beacon, the dex builder's useCompletionBeacon
 * for a league: a debounced 'progress' report to /api/league as the league
 * changes, and an 'export' report from the export button. Same debouncer,
 * same cadence, same flush at the moments a page can vanish, same reasons
 * (see useCompletionBeacon.ts).
 */

function postLeagueBeacon(
  kind: 'progress' | 'export',
  summary: LeagueSummary,
  cards: LeagueCardShape[],
  exportKind: LeagueExportKind | undefined,
  capturedAt: number,
) {
  if (DEMO_MODE || isOptedOut()) return;
  const payload = JSON.stringify({
    cid: getClientId(),
    tool: 'league',
    page: currentPage(),
    kind,
    exportKind,
    summary,
    cards,
    locale: getLocale(),
    ref: externalReferrerHost() || undefined,
    ts: capturedAt,
  });
  void fetch('/api/league', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).catch(() => {
    // best-effort analytics
  });
}

export function useLeagueBeacon() {
  const name = useLeagueStore((s) => s.name);
  const cards = useLeagueStore((s) => s.cards);
  const [debouncer] = useState<BeaconDebouncer>(() =>
    createBeaconDebouncer({ delayMs: PROGRESS_DEBOUNCE_MS, maxWaitMs: PROGRESS_MAX_WAIT_MS }),
  );

  useEffect(() => {
    const summary = summarizeLeague(name, cards);
    if (summary.seats === 0) return;
    sendEventBeacon('league-first-seat', { once: true });
    if (summary.named > 0) sendEventBeacon('league-card-named', { once: true });
    const capturedAt = Date.now();
    const shape = describeLeague(cards);
    debouncer.schedule(() => postLeagueBeacon('progress', summary, shape, undefined, capturedAt));
  }, [name, cards, debouncer]);

  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') debouncer.flush();
    };
    const flush = () => debouncer.flush();
    document.addEventListener('visibilitychange', flushIfHidden);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden);
      window.removeEventListener('pagehide', flush);
      debouncer.flush();
    };
  }, [debouncer]);
}

/** One-shot export report, with the league as it was exported. */
export function sendLeagueExportBeacon(exportKind: LeagueExportKind) {
  const { name, cards } = useLeagueStore.getState();
  postLeagueBeacon('export', summarizeLeague(name, cards), describeLeague(cards), exportKind, Date.now());
}
