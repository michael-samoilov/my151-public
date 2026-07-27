import { useEffect, useState } from 'react';
import { Bug } from 'lucide-react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useT } from '@/i18n';
import { FeedbackSheet } from '@/components/feedback/FeedbackSheet';
import { registerFeedbackOpener, takePendingCrash } from '@/components/feedback/feedbackChannel';
import type { FeedbackCategory, FeedbackContext } from '@/lib/feedbackContext';

/**
 * The always-available way to report something.
 *
 * A floating button rather than a header icon: the header already carries the
 * wordmark, the language globe and the three-way nav that *is* the app's
 * information architecture, and a fourth glyph there would compete with it. A
 * low-key FAB is findable without being loud — it sits at 60% opacity until
 * hovered or focused, so it reads as available rather than as a call to action.
 *
 * The footer carries a text link to the same form, because "report a problem"
 * is something people go looking for at the bottom of a page.
 *
 * It hides whenever a full-screen surface is up. All three of those render at
 * z-50 and the button at z-40, so it would sit behind them anyway — but a
 * button peeking out from under a sheet looks broken even when it is
 * unclickable.
 */

export function FeedbackButton({ route }: { route: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<FeedbackCategory>('bug');
  const [crash, setCrash] = useState<FeedbackContext['error']>(undefined);
  const mobileBrowserOpen = usePokedexStore((s) => s.mobileBrowserOpen);
  const drillDownSegment = usePokedexStore((s) => s.drillDownSegment);
  const celebration = usePokedexStore((s) => s.milestoneCelebration);

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

  const covered = Boolean(mobileBrowserOpen || drillDownSegment || celebration);

  return (
    <>
      {!covered && !open && (
        <button
          type="button"
          onClick={() => {
            setCategory('bug');
            setCrash(undefined);
            setOpen(true);
          }}
          aria-label={t('feedback.title')}
          className="fixed end-3 z-40 h-10 w-10 rounded-full border bg-card/80 backdrop-blur shadow-sm flex items-center justify-center text-muted-foreground opacity-60 hover:opacity-100 focus-visible:opacity-100 hover:text-foreground transition-opacity cursor-pointer"
          // Above the home indicator on iOS, where a bottom-anchored control
          // otherwise lands under the system gesture area.
          style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Bug className="w-4 h-4" />
        </button>
      )}

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
