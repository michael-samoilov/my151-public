import type { FeedbackCategory } from '@/lib/feedbackContext';

export type FeedbackAnchor = HTMLElement | null;

let opener: ((category: FeedbackCategory, anchor: FeedbackAnchor) => void) | null = null;

export function registerFeedbackOpener(
  fn: (category: FeedbackCategory, anchor: FeedbackAnchor) => void,
): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openFeedback(category: FeedbackCategory = 'bug', anchor: FeedbackAnchor = null): void {
  opener?.(category, anchor);
}
