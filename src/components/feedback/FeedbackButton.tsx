import { useT } from '@/i18n';
import { BugIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';
import { openFeedback } from '@/components/feedback/feedbackChannel';

export function FeedbackButton() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={(e) => openFeedback('bug', e.currentTarget)}
      aria-label={t('feedback.title')}
      data-feedback-open
      className="relative before:absolute before:inset-x-0 before:-inset-y-2 before:content-[''] p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
    >
      <BugIcon className="w-4 h-4" {...pathScale(1.16)} />
    </button>
  );
}
