import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT, type NoArgKey } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { isRosterNudge, leagueNudgeEvent, type LeagueNudgeId } from '../model/funnelNudges';
import { pickVisibleAnchor, revealToolbarButton } from '../model/nudgeAnchor';
import { useLeagueUi } from '../store/useLeagueUi';
import type { Fit } from '../useFitScale';

interface NudgeCopy {
  titleKey: NoArgKey;
  bodyKey: NoArgKey;
  ctaKey: NoArgKey;
}

const COPY: Record<LeagueNudgeId, NudgeCopy> = {
  card: {
    titleKey: 'nudge.card.title',
    bodyKey: 'nudge.card.body',
    ctaKey: 'nudge.card.cta',
  },
  league: {
    titleKey: 'nudge.gyms.title',
    bodyKey: 'nudge.gyms.body',
    ctaKey: 'nudge.gyms.cta',
  },
  complete: {
    titleKey: 'nudge.complete.title',
    bodyKey: 'nudge.complete.body',
    ctaKey: 'nudge.gyms.cta',
  },
  full: {
    titleKey: 'nudge.full.title',
    bodyKey: 'nudge.complete.body',
    ctaKey: 'nudge.gyms.cta',
  },
};

const AUTO_DISMISS_MS = 10000;
const CARD_W = 264;
export const REVEAL_DELAY_MS = 360;

/**
 * Whether a nudge floats under an Export button rather than sitting under the
 * league summary. The summary beside an open card on desktop is too narrow
 * for the full-league nudge, so it points at the league's Export button.
 */
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
  const ready = id != null && armed && !browserOpen && !exportOpen;

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

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => finish('dismiss'), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [ready, finish]);

  return { id, armed, ready, finish };
}

function NudgeArrow({ left, below }: { left: number; below: boolean }) {
  return (
    <div
      data-nudge-arrow
      className={
        below
          ? 'absolute z-10 rotate-45 bg-popover border-l border-t'
          : 'absolute z-10 rotate-45 bg-popover border-r border-b'
      }
      style={{ width: 12, height: 12, left: left - 6, ...(below ? { top: -7 } : { bottom: -7 }) }}
    />
  );
}

function NudgeContent({ id, finish, inline = false }: {
  id: LeagueNudgeId;
  finish: (action: 'cta' | 'dismiss') => void;
  inline?: boolean;
}) {
  const t = useT();
  const copy = COPY[id];
  const title = <div className="text-sm font-bold pr-5">{t(copy.titleKey)}</div>;
  const body = <p className="mt-1 text-xs text-muted-foreground text-pretty">{t(copy.bodyKey)}</p>;
  const cta = 'rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:bg-primary/90 transition-colors cursor-pointer';
  return (
    <>
      <button
        type="button"
        aria-label={t('common.dismiss')}
        onClick={() => finish('dismiss')}
        className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
      >
        <X className="w-3.5 h-3.5" />
      </button>
      {title}
      {inline ? (
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">{body}</div>
          <button type="button" onClick={() => finish('cta')} className={`${cta} mt-1 shrink-0 whitespace-nowrap px-3`}>
            {t(copy.ctaKey)}
          </button>
        </div>
      ) : (
        <>
          {body}
          <button type="button" onClick={() => finish('cta')} className={`${cta} mt-2.5 w-full`}>
            {t(copy.ctaKey)}
          </button>
        </>
      )}
    </>
  );
}

const POPUP_CLASS = 'relative rounded-lg border bg-popover shadow-xl p-3 milestone-nudge-in';

export function LeagueFunnelNudge() {
  const { id, armed, ready, finish } = useNudge(useFloats());
  const [anchor, setAnchor] = useState<{ id: LeagueNudgeId; rect: DOMRect } | null>(null);

  useLayoutEffect(() => {
    if (!id || !armed) return;
    let cancelled = false;
    let raf = 0;
    let frames = 0;
    const selector = id === 'card' ? '[data-league-export="card"]' : '[data-league-export="league"]';
    const capture = () => {
      if (cancelled) return;
      const nodes = [...document.querySelectorAll(selector)];
      const el =
        pickVisibleAnchor(nodes, window.innerWidth, window.innerHeight) ??
        (frames > 40 ? nodes[0] ?? null : null);
      if (!el) {
        frames += 1;
        if (frames > 40 && nodes.length === 0) return;
        raf = requestAnimationFrame(capture);
        return;
      }
      revealToolbarButton(el);
      setAnchor({ id, rect: el.getBoundingClientRect() });
    };
    capture();
    const track = document.querySelector('.p151-pane-track');
    track?.addEventListener('transitionend', capture);
    window.addEventListener('resize', capture);
    window.addEventListener('scroll', capture, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      track?.removeEventListener('transitionend', capture);
      window.removeEventListener('resize', capture);
      window.removeEventListener('scroll', capture, true);
    };
  }, [id, armed]);

  if (!anchor || anchor.id !== id || !ready || !id) return null;

  const box = anchor.rect;
  const centerX = box.left + box.width / 2;
  const left = Math.max(8, Math.min(centerX - CARD_W / 2, window.innerWidth - CARD_W - 8));
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14));
  const estimatedH = 148;
  const below = box.bottom + 10 + estimatedH <= window.innerHeight - 8;
  const top = below
    ? Math.max(8, box.bottom + 10)
    : Math.max(8, box.top - estimatedH - 10);

  return createPortal(
    <div
      className="fixed z-[220]"
      style={{ left, top, width: CARD_W }}
      role="status"
      data-testid="league-nudge"
      data-league-nudge={id}
    >
      <div className={POPUP_CLASS}>
        <NudgeArrow left={arrowLeft} below={below} />
        <NudgeContent id={id} finish={finish} />
      </div>
    </div>,
    document.body,
  );
}

const BESIDE_GAP = 12;
const EDGE = 8;
const BESIDE_MIN_W = 220;
const ARROW_INSET = 14;

type Placement =
  | { kind: 'below' }
  | { kind: 'beside'; left: number; top: number; width: number; arrowLeft: number | null };

function samePlacement(a: Placement | null, b: Placement): boolean {
  if (a === null || a.kind !== b.kind) return false;
  if (a.kind === 'below' || b.kind === 'below') return true;
  return a.left === b.left && a.top === b.top && a.width === b.width && a.arrowLeft === b.arrowLeft;
}

export function LeagueRosterNudge({ fit }: { fit: Fit }) {
  const floats = useFloats();
  const { id, ready, finish } = useNudge((nudge) => isRosterNudge(nudge) && !floats(nudge));
  const slotRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Placement | null>(null);

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
        const width = Math.min(CARD_W, paneRight - left);
        const button = document.querySelector('[data-league-export="league"]')?.getBoundingClientRect();
        const arrowX = button ? button.left + button.width / 2 - left : -1;
        const pointable = button !== undefined && button.bottom <= s.top
          && arrowX >= ARROW_INSET && arrowX <= width - ARROW_INSET;
        next = {
          kind: 'beside',
          left: left - o.left,
          top: s.top - o.top,
          width,
          arrowLeft: pointable ? arrowX : null,
        };
      }
      setPlace((cur) => (samePlacement(cur, next) ? cur : next));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [ready, fit.scale, fit.width, fit.budgetRem]);

  const beside = place?.kind === 'beside' ? place : null;
  return (
    <div
      ref={slotRef}
      data-fit-reserve
      className="relative mx-auto"
      style={{ width: fit.width ? fit.width * fit.scale : undefined }}
    >
      {ready && id !== null && place !== null && fit.width > 0 && (
        <div
          role="status"
          data-testid="league-nudge"
          data-league-nudge={id}
          data-nudge-placement={place.kind}
          className={beside ? 'absolute z-10' : 'pt-2'}
          style={beside ? { left: beside.left, top: beside.top, width: beside.width } : undefined}
        >
          <div className={POPUP_CLASS}>
            {beside && beside.arrowLeft !== null && <NudgeArrow left={beside.arrowLeft} below />}
            <NudgeContent id={id} finish={finish} inline={!beside} />
          </div>
        </div>
      )}
    </div>
  );
}
