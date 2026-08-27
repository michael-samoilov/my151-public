import { useEffect, useState } from 'react';
import { useT } from '@/i18n';
import { Bug } from 'lucide-react';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import { registerFeedbackOpener, takePendingCrash } from '@/components/feedback/feedbackChannel';
import type { FeedbackCategory, FeedbackContext } from '@/lib/feedbackContext';

/**
 * The report control, and the sheet it opens.
 *
 * It lives in the `n/151` row beside each page's own controls rather than
 * floating over the page. A floating button was findable but it sat on top of
 * whatever you had scrolled to — on the builder that meant hovering over a
 * section card, which is exactly the content someone is looking at when they
 * decide something is wrong with it. The `n/151` row is chrome, is on every
 * page, and already holds this kind of control, so the button is equally
 * reachable and covers nothing.
 *
 * It renders first in its cluster, so nothing that was already there moves —
 * the settings gear keeps the right edge it has always had, and on the View
 * page the export button keeps its place next to it.
 *
 * The footer keeps its "Report a problem" link, which is the path people go
 * looking for rather than the one they notice.
 */
export function FeedbackButton({ route }: { route: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [crash, setCrash] = useState<FeedbackContext['error']>(undefined);

  useEffect(
    () =>
      registerFeedbackOpener((c) => {
        setCategory(c);
        // An error boundary parks the crash it caught here on its way to
        // opening the form, since the tree that would have carried it as a prop
        // is the one that just died.
        setCrash(takePendingCrash());
        setOpen(true);
      }),
    [],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCategory('bug');
          setCrash(undefined);
          setOpen(true);
        }}
        aria-label={t('feedback.title')}
        // A locale-independent handle for the tests. Its accessible name is
        // translated, which is right for a screen reader and useless for a spec
        // that opens this in nine languages — the alternative is a regex of
        // every translation of "report a problem", which silently stops
        // matching the first time one of them is reworded.
        data-feedback-open
        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
      >
        <Bug className="w-4 h-4" />
      </button>

      {open && (
        <FeedbackSheet
          route={route}
          initialCategory={category}
          error={crash}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
