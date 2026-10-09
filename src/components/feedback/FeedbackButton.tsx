import { useT } from '@/i18n';
import { BugIcon } from '@/components/shared/AppIcons';
import { openFeedback } from '@/components/feedback/feedbackChannel';

/**
 * The report control in each page's `n/151` row.
 *
 * It lives beside each page's own controls rather than floating over the page.
 * A floating button was findable but it sat on top of whatever you had scrolled
 * to, which on the builder is the section card you are looking at when you
 * decide something is wrong with it. The `n/151` row is chrome, is on every
 * page, and already holds this kind of control, so the button is reachable and
 * covers nothing. It renders first in its cluster, so the settings gear and the
 * export button keep the positions they have always had.
 *
 * The button is only the trigger. It calls `openFeedback`, the same channel the
 * footer link uses, and `FeedbackHost` at the app root owns the sheet. Keeping
 * the sheet out of here is what stops it from mounting inside a hidden page.
 */
export function FeedbackButton() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={(e) => openFeedback('bug', e.currentTarget)}
      aria-label={t('feedback.title')}
      // A locale-independent handle for the tests. The accessible name is
      // translated, which is right for a screen reader and useless for a spec
      // that opens this in nine languages: the alternative is a regex of every
      // translation of "report a problem", which stops matching the first time
      // one of them is reworded.
      data-feedback-open
      className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
    >
      {/* 110%, without changing the button's box: at the same 16px the bug's
          thin legs carry less ink than the globe beside it, so it read smaller. */}
      <BugIcon className="w-4 h-4 scale-110" />
    </button>
  );
}
