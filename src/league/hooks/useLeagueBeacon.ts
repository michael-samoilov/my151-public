import { useEffect, useState } from 'react';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { getLocale } from '@/i18n/core';
import { getPinnedLocale } from '@/lib/pinnedLocale';
import { currentPage } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
  type BeaconDebouncer,
} from '@/lib/beaconScheduler';
import { sendEventBeacon, takePendingEvents } from '@/hooks/useCompletionBeacon';
import type { LeagueCardShape, LeagueExportKind, LeagueSummary } from '../../../api/_leagueRecord';
import {
  exportBeaconPlan,
  previewExportHighlight,
  type ExportHighlight,
} from '../export/exportPersonalization';
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
  exportKind?: LeagueExportKind,
  pokemonIds?: number[],
  capturedAt: number = Date.now(),
): Promise<ExportHighlight | null> {
  const plan = exportBeaconPlan({
    demo: DEMO_MODE,
    optedOut: isOptedOut(),
    kind,
  });
  if (plan === 'skip') return Promise.resolve(null);
  if (plan === 'preview') {
    const tool = exportKind === 'card' ? 'card' : 'league';
    return Promise.resolve(previewExportHighlight(tool, pokemonIds ?? []));
  }
  const switched = getPinnedLocale();
  const events = takePendingEvents();
  const payload = JSON.stringify({
    cid: getClientId(),
    tool: 'league',
    page: currentPage(),
    kind,
    exportKind,
    pokemonIds,
    summary,
    cards,
    locale: getLocale(),
    ...(switched ? { switched } : {}),
    ref: externalReferrerHost() || undefined,
    ts: capturedAt,
    notme: isOptedOut() || undefined,
    events: events.length ? events : undefined,
  });
  return fetch('/api/league', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as { highlight?: ExportHighlight };
      return data.highlight ?? null;
    })
    .catch(() => null);
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
    debouncer.schedule(() => {
      void postLeagueBeacon('progress', summary, shape, undefined, undefined, capturedAt);
    });
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
export function sendLeagueExportBeacon(
  exportKind: LeagueExportKind,
  pokemonIds: number[],
): Promise<ExportHighlight | null> {
  const { name, cards } = useLeagueStore.getState();
  return postLeagueBeacon(
    'export',
    summarizeLeague(name, cards),
    describeLeague(cards),
    exportKind,
    pokemonIds,
    Date.now(),
  );
}
