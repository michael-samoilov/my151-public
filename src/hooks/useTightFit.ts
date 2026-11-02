import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';

export function useTightFit<E extends HTMLElement>(layout: string | null, ref: RefObject<E | null>, tooWide: (element: E) => boolean): boolean {
  const [fit, setFit] = useState<{ key: string; tight: boolean } | null>(null);
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
