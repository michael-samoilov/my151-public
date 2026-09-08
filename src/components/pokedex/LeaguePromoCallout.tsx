import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { isLeaguePromoSeen, markLeaguePromoSeen } from '@/lib/launchFlags';

/**
 * Tells a person who already had a dex that the gym leader maker exists.
 *
 * Shown once per browser, on the first visit after the launch, only when a
 * dex was already saved at mount: a new visitor has no reason to be
 * interrupted, and has usually just come from the hub, which is the same
 * message as a page. The hub marks it seen for a returning visitor too, so
 * someone who arrived through the hub never sees it twice. Follows the
 * engagement guardrails: once per trigger, one-tap dismiss, never blocks
 * input, invitation language.
 */
export function LeaguePromoCallout({ placedAtMount }: { placedAtMount: number }) {
  const t = useT();
  const [open, setOpen] = useState(() => placedAtMount > 0 && !isLeaguePromoSeen());
  useEffect(() => {
    if (!open) return;
    markLeaguePromoSeen();
    sendEventBeacon('league-promo-shown', { once: true });
  }, [open]);
  if (!open) return null;
  return (
    <div
      data-testid="league-promo"
      role="status"
      className="relative mb-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3 pr-10"
    >
      <button
        type="button"
        aria-label={t('promo.league.dismiss')}
        onClick={() => {
          sendEventBeacon('league-promo-dismiss');
          setOpen(false);
        }}
        className="absolute right-1 top-1 p-2 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" />
      </button>
      <p className="m-0 text-sm font-semibold">{t('promo.league.title')}</p>
      <p className="m-0 mt-0.5 text-xs text-muted-foreground text-pretty">{t('promo.league.body')}</p>
      <a
        href="/custom-gym-leader"
        onClick={() => sendEventBeacon('league-promo-cta')}
        className="mt-1.5 inline-block text-xs font-semibold text-primary underline underline-offset-2"
      >
        {t('promo.league.cta')}
      </a>
    </div>
  );
}
