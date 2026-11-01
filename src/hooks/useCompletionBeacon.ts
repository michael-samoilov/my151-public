import {minuteActivityPayload,acknowledgeMinuteActivity,encodeActivityBeacon} from '@/lib/minuteActivity';
import {attentionPayload,seenPayload,subscribeAttention} from '@/lib/activeAttention';
import { useEffect, useRef, useState } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { getPokemonById } from '@/hooks/usePokemonData';
import { DEMO_MODE } from '@/lib/demoMode';
import { getClientId, isOptedOut } from '@/lib/clientId';
import { AUTOMATED } from '@/lib/automation';
import type { ExportSurveySkipReason, ExportSurveyTool } from '@/lib/exportSurvey';
import { getLocale } from '@/i18n/core';
import { getPinnedLocale } from '@/lib/pinnedLocale';
import { currentPage, currentTool } from '@/lib/tool';
import { externalReferrerHost } from '@/lib/referrer';
import {
  exportBeaconPlan,
  previewExportHighlight,
  type ExportHighlight,
} from '@/league/export/exportPersonalization';
import {
  createBeaconDebouncer,
  PROGRESS_DEBOUNCE_MS,
  PROGRESS_MAX_WAIT_MS,
  type BeaconDebouncer,
} from '@/lib/beaconScheduler';

type BeaconKind = 'progress' | 'completion' | 'export';

const MIN_PROGRESS_IDS = 1;
function countEvoLines(ids: number[]): number {
  const chains = new Set<number>();
  for (const id of ids) {
    const p = getPokemonById(id);
    chains.add(p ? p.evolutionChainId : -id);
  }
  return chains.size;
}

interface ExportSettings {
  sort: string;
  outlines: boolean;
  groupSpecial: boolean;
  showStats: boolean;
}

const PENDING_EVENTS_KEY = 'p151-pending-events';
function bufferPendingEvent(event: string) {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]') as string[];
    if (!cur.includes(event)) {
      cur.push(event);
      localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(cur.slice(-20)));
    }
  } catch {
    return;
  }
}
export function takePendingEvents(): string[] {
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]') as string[];
    if (cur.length) localStorage.removeItem(PENDING_EVENTS_KEY);
    return Array.isArray(cur) ? cur : [];
  } catch {
    return [];
  }
}

/** Puts events back after a send the server did not store, so the next beacon carries them. */
export function returnPendingEvents(events: string[] | undefined) {
  if (!events?.length) return;
  try {
    const cur = JSON.parse(localStorage.getItem(PENDING_EVENTS_KEY) || '[]') as string[];
    const merged = [...events, ...cur.filter((e) => !events.includes(e))];
    localStorage.setItem(PENDING_EVENTS_KEY, JSON.stringify(merged.slice(-20)));
  } catch {
    return;
  }
}

function postBeacon(
  ids: number[],
  kind: BeaconKind,
  sections?: Record<string, number[]>,
  exportSettings?: ExportSettings,
  capturedAt?: number,
) {
  if (DEMO_MODE || ids.length === 0) return;
  if (isOptedOut() && kind !== 'export') return;
  const cid = getClientId();
  const events = kind === 'export' ? undefined : takePendingEvents();
  const switched = getPinnedLocale();
  const payload = encodeActivityBeacon({
    cid,
    tool: currentTool(),
    page: currentPage(),
    kind,
    ids,
    depth: countEvoLines(ids),
    sections,
    exportSettings,
    locale: getLocale(),
    ...(switched ? { switched } : {}),
    events: events && events.length ? events : undefined,
    ref: externalReferrerHost() || undefined,
    ts: capturedAt ?? Date.now(),
    attention: attentionPayload('dex'),
    seen: seenPayload('dex'),
    activity: minuteActivityPayload('dex'),
    notme: isOptedOut() || undefined,
    auto: AUTOMATED || undefined,
  });
  void fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    keepalive: true,
  }).then(async response=>{
    if(!response.ok){returnPendingEvents(events);return;}
    const data=await response.json();
    if(data.contended)returnPendingEvents(events);
    acknowledgeMinuteActivity('dex',data.activityAck);
  }).catch(() => returnPendingEvents(events));
}

export function useCompletionBeacon() {
  const sections = usePokedexStore((s) => s.sections);
  const completedRef = useRef<string | null>(null);
  const [debouncer] = useState<BeaconDebouncer>(() =>
    createBeaconDebouncer({
      delayMs: PROGRESS_DEBOUNCE_MS,
      maxWaitMs: PROGRESS_MAX_WAIT_MS,
    }),
  );

  useEffect(() => {
    const allIds = Object.values(sections).flat();

    if (allIds.length === 151) {
      const key = allIds.slice().sort((a, b) => a - b).join(',');
      if (completedRef.current !== key) {
        completedRef.current = key;
        postBeacon(allIds, 'completion', sections);
      }
    }

    const capturedAt = Date.now();
    if (allIds.length >= MIN_PROGRESS_IDS) {
      debouncer.schedule(() => postBeacon(allIds, 'progress', sections, undefined, capturedAt));
    }
  }, [sections, debouncer]);

  useEffect(()=>subscribeAttention('dex',()=>{
    const current=usePokedexStore.getState().sections;
    const ids=Object.values(current).flat();
    if(ids.length>=MIN_PROGRESS_IDS)debouncer.schedule(()=>postBeacon(ids,'progress',current,undefined,Date.now()));
  }),[debouncer]);

  // Deliver the pending beacon at the moments a page can vanish. On iOS,
  // unload/beforeunload are unreliable or never fire; visibilitychange→hidden
  // plus pagehide is the supported pair, and fetch keepalive (already used by
  // postBeacon) lets the request outlive the page. This is what makes a short
  // mobile session — edit, admire, swipe away — actually reach the server.
  useEffect(() => {
    const flushIfHidden = () => {
      if (document.visibilityState === 'hidden') debouncer.flush();
    };
    const flush = () => debouncer.flush();
    document.addEventListener('visibilitychange', flushIfHidden);
    window.addEventListener('pagehide', flush);
    window.addEventListener('blur', flush);
    return () => {
      document.removeEventListener('visibilitychange', flushIfHidden);
      window.removeEventListener('pagehide', flush);
      window.removeEventListener('blur', flush);
      debouncer.flush();
    };
  }, [debouncer]);
}

export async function sendExportBeacon(
  ids: number[],
  settings?: ExportSettings,
  sections?: Record<string, number[]>,
): Promise<ExportHighlight | null> {
  if (ids.length === 0) return null;
  const plan = exportBeaconPlan({
    demo: DEMO_MODE,
    optedOut: isOptedOut(),
    kind: 'export',
  });
  if (plan === 'skip') return null;
  if (plan === 'preview') return previewExportHighlight('pokedex', ids);

  const cid = getClientId();
  const payload = encodeActivityBeacon({
    cid,
    tool: currentTool(),
    page: currentPage(),
    kind: 'export',
    ids,
    depth: countEvoLines(ids),
    sections,
    exportSettings: settings,
    locale: getLocale(),
    ref: externalReferrerHost() || undefined,
    ts: Date.now(),
    attention: attentionPayload('dex'),
    seen: seenPayload('dex'),
    activity: minuteActivityPayload('dex'),
    notme: isOptedOut() || undefined,
    auto: AUTOMATED || undefined,
  });
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
      keepalive: true,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { highlight?: ExportHighlight;activityAck?:unknown };
    acknowledgeMinuteActivity('dex',data.activityAck);
    return data.highlight ?? null;
  } catch {
    return null;
  }
}

const EVENT_SENT_PREFIX = 'p151-ev-';

export function sendEventBeacon(
  event: string,
  opts?: { once?: boolean; exportTool?: ExportSurveyTool; reason?: ExportSurveySkipReason },
) {
  if (DEMO_MODE || isOptedOut()) return;
  const cid = getClientId();
  if (opts?.once) {
    try {
      const k = EVENT_SENT_PREFIX + event;
      if (localStorage.getItem(k)) return;
      localStorage.setItem(k, '1');
    } catch {
      // storage unavailable — fall through and send (may double-count)
    }
  }
  bufferPendingEvent(event);
  void fetch('/api/event', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      cid,
      event,
      tool: currentTool(),
      page: currentPage(),
      ...(opts?.exportTool ? { exportTool: opts.exportTool } : {}),
      ...(opts?.reason ? { reason: opts.reason } : {}),
      auto: AUTOMATED || undefined,
    }),
    keepalive: true,
  }).catch(() => {
  });
}
