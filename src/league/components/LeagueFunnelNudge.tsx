import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useT, type NoArgKey } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { isRosterNudge, leagueNudgeEvent, type LeagueNudgeId } from '../model/funnelNudges';
import { revealToolbarButton } from '../model/nudgeAnchor';
import { FloatingTip, TipCard } from '@/components/milestone/TipCard';
import { useOverlayOpen } from '@/components/milestone/useOverlayOpen';
import { useLeagueUi } from '../store/useLeagueUi';
import type { Fit } from '../useFitScale';

interface NudgeCopy {
  tip: string;
  titleKey: NoArgKey;
  ctaKey: NoArgKey;
}

const COPY: Record<LeagueNudgeId, NudgeCopy> = {
  card: { tip: 'league-card', titleKey: 'nudge.card.title', ctaKey: 'nudge.card.cta' },
  league: { tip: 'league-gyms', titleKey: 'nudge.gyms.title', ctaKey: 'nudge.gyms.cta' },
  complete: { tip: 'league-complete', titleKey: 'nudge.complete.title', ctaKey: 'nudge.gyms.cta' },
  full: { tip: 'league-full', titleKey: 'nudge.full.title', ctaKey: 'nudge.gyms.cta' },
};
export const REVEAL_DELAY_MS = 360;

function useFloats() {
  const openCard = useLeagueUi((s) => s.openCard);
  const isDesktop = useIsDesktop();
  return (id: LeagueNudgeId) => id === 'card' || (id === 'full' && isDesktop && openCard !== null);
}

function useNudge(owns: (id: LeagueNudgeId) => boolean) {
  const active = useLeagueUi((s) => s.activeNudge);
  const id = active !== null && owns(active) ? active : null;
  const dismissNudge = useLeagueUi((s) => s.dismissNudge);
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);
  const openCard = useLeagueUi((s) => s.openCard);
  const lastCard = useLeagueUi((s) => s.lastCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);

  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!id) return;
    const timer = setTimeout(() => setArmed(true), REVEAL_DELAY_MS);
    return () => {
      clearTimeout(timer);
      setArmed(false);
    };
  }, [id]);
  const covered = useOverlayOpen(id != null && !browserOpen && !exportOpen);
  const ready = id != null && armed && !browserOpen && !exportOpen && !covered;

  useEffect(() => {
    if (id) sendEventBeacon(leagueNudgeEvent(id, 'shown'), { once: true });
  }, [id]);

  const finish = useCallback(
    (action: 'cta' | 'dismiss') => {
      if (!id) return;
      sendEventBeacon(leagueNudgeEvent(id, action));
      if (action === 'cta') {
        openLeagueExport(id === 'card' ? (openCard ?? lastCard) : undefined);
      }
      dismissNudge();
    },
    [id, openCard, lastCard, openLeagueExport, dismissNudge],
  );

  return { id, ready, finish };
}

function NudgeTip({ id, finish, anchor, notch, className }: {
  id: LeagueNudgeId;
  finish: (action: 'cta' | 'dismiss') => void;
  anchor: Element | null;
  notch: number | null;
  className?: string;
}) {
  const t = useT();
  return (
    <TipCard
      id={COPY[id].tip}
      target={id === 'card' ? 'league-card-export' : 'league-export'}
      title={t(COPY[id].titleKey)}
      action={t(COPY[id].ctaKey)}
      onAction={() => finish('cta')}
      onDismiss={() => finish('dismiss')}
      anchor={anchor}
      notch={notch}
      className={className}
    />
  );
}

export function LeagueFunnelNudge() {
  const { id, ready, finish } = useNudge(useFloats());
  const t = useT();
  if (!ready || !id) return null;
  return (
    <FloatingTip
      key={id}
      id={COPY[id].tip}
      target={id === 'card' ? 'league-card-export' : 'league-export'}
      title={t(COPY[id].titleKey)}
      action={t(COPY[id].ctaKey)}
      onAction={() => finish('cta')}
      onDismiss={() => finish('dismiss')}
      onAnchor={revealToolbarButton}
    />
  );
}

const BESIDE_GAP = 12;
const EDGE = 8;
const BESIDE_MIN_W = 220;
const ARROW_INSET = 14;

type Placement =
  | { kind: 'below' }
  | { kind: 'beside'; left: number; top: number; room: number; arrowX: number | null };

function samePlacement(a: Placement | null, b: Placement): boolean {
  if (a === null || a.kind !== b.kind) return false;
  if (a.kind === 'below' || b.kind === 'below') return true;
  return a.left === b.left && a.top === b.top && a.room === b.room && a.arrowX === b.arrowX;
}

export function LeagueRosterNudge({ fit }: { fit: Fit }) {
  const floats = useFloats();
  const { id, ready, finish } = useNudge((nudge) => isRosterNudge(nudge) && !floats(nudge));
  const slotRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);
  const [exportButton, setExportButton] = useState<Element | null>(null);

  useLayoutEffect(() => {
    const slot = slotRef.current;
    if (!ready || !slot) return;
    const measure = () => {
      const column = slot.parentElement;
      const pane = slot.closest('[data-lg-viewport]');
      const summary = slot.previousElementSibling?.querySelector('[data-lg-league-root]');
      if (!column || !pane || !summary) return;
      const paneRight = pane.getBoundingClientRect().left + pane.clientLeft + pane.clientWidth - EDGE;
      const columnRight =
        column.getBoundingClientRect().right - (parseFloat(getComputedStyle(column).paddingRight) || 0);
      let next: Placement = { kind: 'below' };
      if (paneRight - columnRight - BESIDE_GAP >= BESIDE_MIN_W) {
        const s = summary.getBoundingClientRect();
        const o = slot.getBoundingClientRect();
        const left = s.right + BESIDE_GAP;
        const exportEl = document.querySelector('[data-league-export="league"]');
        setExportButton(exportEl);
        const button = exportEl?.getBoundingClientRect();
        next = {
          kind: 'beside',
          left: left - o.left,
          top: s.top - o.top,
          room: paneRight - left,
          arrowX: button && button.bottom <= s.top ? button.left + button.width / 2 - left : null,
        };
      }
      setPlace((cur) => (samePlacement(cur, next) ? cur : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ready, fit.scale, fit.width, fit.budgetRem]);

  const tipRef = useRef<HTMLDivElement>(null);
  const [tipWidth, setTipWidth] = useState(0);
  const beside = place?.kind === 'beside' ? place : null;
  useLayoutEffect(() => {
    const card = tipRef.current?.firstElementChild;
    if (beside && card instanceof HTMLElement) setTipWidth(card.offsetWidth);
  }, [beside, id]);
  const notch = beside && beside.arrowX !== null && beside.arrowX >= ARROW_INSET && beside.arrowX <= tipWidth - ARROW_INSET
    ? beside.arrowX
    : null;
  return (
    <div
      ref={slotRef}
      data-fit-reserve
      className="relative mx-auto"
      style={{ width: fit.width ? fit.width * fit.scale : undefined }}
    >
      {ready && id !== null && place !== null && fit.width > 0 && (
        <div
          ref={tipRef}
          data-nudge-placement={place.kind}
          className={beside ? 'absolute z-10' : 'pt-2'}
          style={beside ? { left: beside.left, top: beside.top, width: 'max-content', maxWidth: beside.room } : undefined}
        >
          <NudgeTip
            id={id}
            finish={finish}
            anchor={exportButton}
            notch={notch}
            className={beside ? 'w-max max-w-full' : 'w-full'}
          />
        </div>
      )}
    </div>
  );
}
