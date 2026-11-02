import { useEffect, useState } from 'react';

const OVERLAY = '[role="dialog"], [data-overlay]';

function overlayShown(): boolean {
  for (const el of document.querySelectorAll(OVERLAY)) {
    if (el.getClientRects().length > 0) return true;
  }
  return false;
}

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
