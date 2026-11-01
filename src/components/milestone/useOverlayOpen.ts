import { useEffect, useState } from 'react';

const OVERLAY = '[role="dialog"], [data-overlay]';

function overlayShown(): boolean {
  for (const el of document.querySelectorAll(OVERLAY)) {
    if (el.getClientRects().length > 0) return true;
  }
  return false;
}

/**
 * Whether a sheet, pane, or dialog is on screen. A nudge belongs to the build
 * page itself, so it waits while anything covers that page. It watches only while
 * `enabled`, because a nudge is pending only briefly.
 */
export function useOverlayOpen(enabled: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const update = () => setOpen(overlayShown());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['role', 'data-overlay', 'hidden', 'class'] });
    return () => {
      observer.disconnect();
      setOpen(false);
    };
  }, [enabled]);
  return enabled && open;
}
