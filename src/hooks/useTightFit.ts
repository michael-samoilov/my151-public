import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

/**
 * Whether content is too wide at its full size, for a layout that collapses when it is.
 *
 * `layout` names everything that sets the full width, or is null when nothing needs measuring.
 * When it changes, or a web font finishes loading, the content renders in full once and
 * `tooWide` measures `ref`'s element, so the measurement never sees its own collapse.
 */
export function useTightFit<E extends HTMLElement>(layout: string | null, ref: RefObject<E | null>, tooWide: (element: E) => boolean): boolean {
  const [fit, setFit] = useState<{ key: string; tight: boolean } | null>(null);
  // A web font that arrives after the first measure changes every text width.
  const [fontLoads, setFontLoads] = useState(0);
  const measures = layout !== null;
  const key = measures ? `${layout}|${fontLoads}` : null;
  const measured = key !== null && fit?.key === key;

  useEffect(() => {
    if (!measures) return;
    const remeasure = () => setFontLoads((n) => n + 1);
    document.fonts.addEventListener('loadingdone', remeasure);
    return () => document.fonts.removeEventListener('loadingdone', remeasure);
  }, [measures]);

  useLayoutEffect(() => {
    const element = ref.current;
    if (key !== null && !measured && element) setFit({ key, tight: tooWide(element) });
  }, [key, measured, ref, tooWide]);

  return measured && fit.tight;
}
