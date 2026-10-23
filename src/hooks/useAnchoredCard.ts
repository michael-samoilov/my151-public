import { useLayoutEffect, useRef } from 'react';

const CARD_GAP = 8;
const CARD_MARGIN = 12;

export function useAnchoredCard(anchor: HTMLElement | null, enabled: boolean) {
  const card = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = card.current;
    if (!enabled || !anchor || !el) return;

    const place = () => {
      const a = anchor.getBoundingClientRect();
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      const below = a.bottom + CARD_GAP;
      const above = a.top - CARD_GAP - h;
      const fitsBelow = below + h <= window.innerHeight - CARD_MARGIN;
      const top = fitsBelow || above < CARD_MARGIN ? below : above;
      const clamp = (v: number, max: number) => Math.min(Math.max(CARD_MARGIN, v), Math.max(CARD_MARGIN, max));
      el.style.top = `${clamp(top, window.innerHeight - h - CARD_MARGIN)}px`;
      el.style.left = `${clamp(a.right - w, window.innerWidth - w - CARD_MARGIN)}px`;
    };

    place();
    // The anchor sits in a page row rather than fixed chrome, so a scroll
    // behind the card moves it. Capture, because the scroll that matters is an
    // inner container's, and a scroll event does not bubble.
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
    ro?.observe(el);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
      ro?.disconnect();
    };
  }, [anchor, enabled]);

  return card;
}
