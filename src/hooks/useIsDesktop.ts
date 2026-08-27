import { useEffect, useState } from 'react';

/** True at or above the desktop breakpoint. Must match this repo's `md:`
 *  (1024px, see `--breakpoint-md` in `index.css`), not Tailwind's 768px
 *  default. Used to mount exactly one variant of breakpoint-paired UI
 *  (desktop browser panel vs mobile sheet, drilldown pane vs drilldown
 *  sheet) instead of rendering both and hiding one with CSS. */
export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= 1024
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  return isDesktop;
}
