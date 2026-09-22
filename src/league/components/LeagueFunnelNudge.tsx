import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT, type NoArgKey } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { leagueNudgeEvent, type LeagueNudgeId } from '../model/funnelNudges';
import { pickVisibleAnchor } from '../model/nudgeAnchor';
import { useLeagueUi } from '../store/useLeagueUi';

/**
 * League export nudges. Same popup as the dex builder's MilestoneCelebration,
 * pointed at the toolbar Export button instead of a nav tab. Beacons go
 * through sendEventBeacon (/api/event), including the shown/cta/dismiss
 * trio intro and league-promo already use.
 */

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
};

const AUTO_DISMISS_MS = 10000;
const CARD_W = 264;
const REVEAL_DELAY_MS = 260;

export function LeagueFunnelNudge() {
  const t = useT();
  const id = useLeagueUi((s) => s.activeNudge);
  const dismissNudge = useLeagueUi((s) => s.dismissNudge);
  const openLeagueExport = useLeagueUi((s) => s.openLeagueExport);
  const openCard = useLeagueUi((s) => s.openCard);
  const lastCard = useLeagueUi((s) => s.lastCard);
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  const exportOpen = useLeagueUi((s) => s.exportOpen);
  const copy = id ? COPY[id] : null;
  const [anchor, setAnchor] = useState<{ id: LeagueNudgeId; rect: DOMRect } | null>(null);

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

  useLayoutEffect(() => {
    if (!id) return;
    let cancelled = false;
    let raf = 0;
    let frames = 0;
    const selector = `[data-league-export="${id}"]`;
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
      el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
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
    if (!copy || !ready) return;
    const timer = setTimeout(() => finish('dismiss'), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [copy, ready, finish]);

  if (!copy || !anchor || anchor.id !== id || !ready || !id) return null;

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
      <div className="relative rounded-lg border bg-popover shadow-xl p-3 milestone-nudge-in">
        <div
          data-nudge-arrow
          className={
            below
              ? 'absolute z-10 rotate-45 bg-popover border-l border-t'
              : 'absolute z-10 rotate-45 bg-popover border-r border-b'
          }
          style={{ width: 12, height: 12, left: arrowLeft - 6, ...(below ? { top: -7 } : { bottom: -7 }) }}
        />
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={() => finish('dismiss')}
          className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="text-sm font-bold pr-5">{t(copy.titleKey)}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{t(copy.bodyKey)}</p>
        <button
          type="button"
          onClick={() => finish('cta')}
          className="mt-2.5 w-full rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {t(copy.ctaKey)}
        </button>
      </div>
    </div>,
    document.body,
  );
}
