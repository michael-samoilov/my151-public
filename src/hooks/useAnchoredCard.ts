import { useLayoutEffect, useRef } from 'react';

/** Gap between the card and its anchor, and the card and the viewport edge. */
const CARD_GAP = 8;
const CARD_MARGIN = 12;

/**
 * Position a desktop card against the control that opened it.
 *
 * Below the anchor and aligned to its right edge is the default, because every
 * anchor today sits in a chrome row with the page under it. When the card would
 * run off the bottom it flips above the anchor instead, and in both axes it is
 * clamped into the viewport — a footer link near the bottom left has neither
 * the room below nor the room to the right.
 *
 * The effect writes `style.top` / `style.left` on the node rather than setting
 * React state. Position is a measurement of the DOM, taken after layout and fed
 * straight back into it; routing it through a render would put a stale frame on
 * screen first and buy nothing, since nothing else reads it.
 *
 * With no anchor — the crash screen, whose own button the feedback form is
 * replacing — the effect does nothing and the card keeps the corner its classes
 * give it.
 *
 * Two cards use it: the feedback form and the league card's instructions.
 */
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
      // Flip up only when the card genuinely does not fit below and does fit
      // above. Clamping handles the case where neither is true.
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
    // A card's content can change its height (the feedback form grows as you
    // type, open the disclosure, or fail a send).
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
