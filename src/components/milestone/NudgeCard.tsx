import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '@/i18n';

const AUTO_DISMISS_MS = 10000;
const CARD_W = 264;

/**
 * The milestone popup: a card that hangs under the control `anchor` selects,
 * with an arrow up at it, a call to action, and a close button. It dismisses
 * itself 10 seconds after it appears. Mount it only while it should show; pass
 * a stable `onDismiss`, or the timer restarts on every render.
 */
export function NudgeCard({ anchor, title, body, cta, onCta, onDismiss }: {
  /** CSS selector of the control the card points at. */
  anchor: string;
  title: string;
  body: string;
  cta: string;
  onCta: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  const [rect, setRect] = useState<DOMRect | null>(null);

  // Track the control's position while the card is up.
  useLayoutEffect(() => {
    const el = document.querySelector(anchor);
    if (!el) return;
    const update = () => setRect(el.getBoundingClientRect());
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchor]);

  useEffect(() => {
    const timer = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!rect) return null;

  const centerX = rect.left + rect.width / 2;
  const left = Math.max(8, Math.min(centerX - CARD_W / 2, window.innerWidth - CARD_W - 8));
  const arrowLeft = Math.max(14, Math.min(centerX - left, CARD_W - 14));
  const top = rect.bottom + 10;

  return createPortal(
    <div className="fixed z-[220]" style={{ left, top, width: CARD_W }} role="status">
      <div className="relative rounded-lg border bg-popover shadow-xl p-3 milestone-nudge-in">
        {/* up-arrow — a rotated square whose two bordered edges form the
            pointer. Sized + positioned in px (not rem) so its left/right
            corners land exactly on the card's top border line: the element's
            vertical center sits at the border (top = -border - size/2), and its
            fill covers the border between the corners so there's no seam. */}
        <div
          className="absolute z-10 rotate-45 bg-popover border-l border-t"
          style={{ width: 12, height: 12, left: arrowLeft - 6, top: -7 }}
        />
        <button
          type="button"
          aria-label={t('common.dismiss')}
          onClick={onDismiss}
          className="absolute right-1.5 top-1.5 p-1 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
        <div className="text-sm font-bold pr-5">{title}</div>
        <p className="mt-1 text-xs text-muted-foreground text-pretty">{body}</p>
        <button
          type="button"
          onClick={onCta}
          className="mt-2.5 w-full rounded-md bg-primary text-primary-foreground text-xs font-semibold py-1.5 hover:bg-primary/90 transition-colors cursor-pointer"
        >
          {cta}
        </button>
      </div>
    </div>,
    document.body,
  );
}
