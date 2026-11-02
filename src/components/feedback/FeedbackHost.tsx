import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { loadChunk } from '@/lib/staleDeploy';
import { whenIdle } from '@/lib/whenIdle';
import { registerFeedbackOpener, type FeedbackAnchor } from '@/components/feedback/feedbackChannel';
import type { FeedbackCategory, FeedbackToolContext } from '@/lib/feedbackContext';
import { ScreenSpinner } from '@/components/shared/PokeBallSpinner';

type Sheet = typeof import('./FeedbackSheet').FeedbackSheet;
let loadedSheet: Sheet | null = null;
const loadSheet = () => loadChunk(() => import('./FeedbackSheet')).then((module) => (loadedSheet = module.FeedbackSheet));
const LazySheet = lazy(() => loadSheet().then((FeedbackSheet) => ({ default: FeedbackSheet })));

// platform: iOS opens the keyboard only when focus happens inside the tap, so the form code preloads once the page is idle.
if (typeof document !== 'undefined') {
  const prefetch = () => whenIdle(() => { void loadSheet().catch(() => {}); });
  if (document.readyState === 'complete') prefetch();
  else window.addEventListener('load', prefetch, { once: true });
}

export function FeedbackHost({ route, getToolContext }: {
  route: string;
  getToolContext?: () => FeedbackToolContext;
}) {
  const contextRef = useRef(getToolContext);
  useEffect(() => { contextRef.current = getToolContext; }, [getToolContext]);
  const [toolContext, setToolContext] = useState<FeedbackToolContext | undefined>();
  const [OpenSheet, setOpenSheet] = useState<Sheet | typeof LazySheet | null>(null);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [anchor, setAnchor] = useState<FeedbackAnchor>(null);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(
    () =>
      registerFeedbackOpener((c, from) => {
        opener.current = from ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
        setCategory(c);
        setAnchor(from);
        setToolContext(contextRef.current?.());
        setOpenSheet((current: typeof OpenSheet) => current ?? loadedSheet ?? LazySheet);
      }),
    [],
  );

  if (!OpenSheet) return null;
  return (
    <Suspense fallback={<ScreenSpinner />}>
      <OpenSheet
        route={route}
        toolContext={toolContext}
        initialCategory={category}
        anchor={anchor}
        onClose={() => {
          setOpenSheet(null);
          opener.current?.focus({ preventScroll: true });
        }}
      />
    </Suspense>
  );
}
