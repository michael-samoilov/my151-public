import { useEffect, useRef, useState } from 'react';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import {
  registerFeedbackOpener,
  takePendingCrash,
  type FeedbackAnchor,
} from '@/components/feedback/feedbackChannel';
import type { FeedbackCategory, FeedbackContext, FeedbackToolContext } from '@/lib/feedbackContext';

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
 * It also sits outside every page's error boundary, so a page that has crashed
 * can still open the form its fallback offers.
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
  const [crash, setCrash] = useState<FeedbackContext['error']>(undefined);
  // What was clicked, so the desktop card can open beside it.
  const [anchor, setAnchor] = useState<FeedbackAnchor>(null);

  useEffect(
    () =>
      registerFeedbackOpener((c, from) => {
        setCategory(c);
        setAnchor(from);
        // An error boundary parks the crash it caught here on its way to
        // opening the form, because the tree that would have carried it as a
        // prop is the one that just died.
        setCrash(takePendingCrash());
        setToolContext(contextRef.current?.());
        setOpen(true);
      }),
    [],
  );

  if (!open) return null;
  return (
    <FeedbackSheet
      route={route}
      toolContext={toolContext}
      initialCategory={category}
      error={crash}
      anchor={anchor}
      onClose={() => setOpen(false)}
    />
  );
}
