import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { reloadIfStale } from '@/lib/staleDeploy';
import { whenIdle } from '@/lib/whenIdle';
import { registerFeedbackOpener, type FeedbackAnchor } from '@/components/feedback/feedbackChannel';
import type { FeedbackCategory, FeedbackToolContext } from '@/lib/feedbackContext';
import { ScreenSpinner } from '@/components/shared/PokeBallSpinner';

type Sheet = typeof import('./FeedbackSheet').FeedbackSheet;
let loadedSheet: Sheet | null = null;
const loadSheet = () => reloadIfStale(import('./FeedbackSheet')).then((module) => (loadedSheet = module.FeedbackSheet));
const LazySheet = lazy(() => loadSheet().then((FeedbackSheet) => ({ default: FeedbackSheet })));

// The form's code stays off the first download and arrives once the page has
// loaded and gone idle. A tap after that renders the form inside the tap, so
// its text field takes focus there and iOS opens the keyboard; loaded on the
// tap, the focus came after the download and the first report after a reload
// opened without a keyboard (October 2026).
if (typeof document !== 'undefined') {
  const prefetch = () => whenIdle(() => { void loadSheet().catch(() => {}); });
  if (document.readyState === 'complete') prefetch();
  else window.addEventListener('load', prefetch, { once: true });
}

/**
 * The single mount point for the report form.
 *
 * One host at the app root, not one per page. The sheet used to live inside
 * each page's `FeedbackButton`, and the three buttons shared one module-level
 * opener slot, last writer wins. Because a page stays mounted but hidden after
 * you leave it, opening the form from another page's footer mounted the sheet
 * inside a `display: none` subtree, where it measured 0x0 and never appeared.
 * A host that sits outside every page's subtree cannot land in a hidden one.
 *
 * It also sits outside every page's error boundary, so the bug icon still
 * opens the form after a page has crashed.
 *
 * `route` is the page the report is about. It comes from the visible view
 * rather than from whichever button was clicked, so the footer link, which
 * belongs to no page, reports the page the reader is actually on.
 */
export function FeedbackHost({ route, getToolContext }: {
  route: string;
  getToolContext?: () => FeedbackToolContext;
}) {
  const contextRef = useRef(getToolContext);
  useEffect(() => { contextRef.current = getToolContext; }, [getToolContext]);
  const [toolContext, setToolContext] = useState<FeedbackToolContext | undefined>();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  // What was clicked, so the desktop card can open beside it.
  const [anchor, setAnchor] = useState<FeedbackAnchor>(null);

  useEffect(
    () =>
      registerFeedbackOpener((c, from) => {
        setCategory(c);
        setAnchor(from);
        setToolContext(contextRef.current?.());
        setOpen(true);
      }),
    [],
  );

  if (!open) return null;
  const Sheet = loadedSheet;
  return (
    Sheet ? (
      <Sheet
        route={route}
        toolContext={toolContext}
        initialCategory={category}
        anchor={anchor}
        onClose={() => setOpen(false)}
      />
    ) : (
      <Suspense fallback={<ScreenSpinner />}>
        <LazySheet
          route={route}
          toolContext={toolContext}
          initialCategory={category}
          anchor={anchor}
          onClose={() => setOpen(false)}
        />
      </Suspense>
    )
  );
}
