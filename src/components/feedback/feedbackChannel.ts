import type { FeedbackContext, FeedbackCategory } from '@/lib/feedbackContext';

/**
 * How anything outside the feedback tree opens the report form.
 *
 * A module-level channel rather than props or store state, for two reasons.
 * The footer link lives in three different pages' trees and none of them is an
 * ancestor of the button. And the error boundary is on the far side of a crash:
 * by the time the form mounts, the tree that would have carried the error down
 * as a prop is the tree that just died.
 */

let opener: ((category: FeedbackCategory) => void) | null = null;
let pendingCrash: FeedbackContext['error'] = undefined;

/** Called by the mounted button; returns the teardown. */
export function registerFeedbackOpener(fn: (category: FeedbackCategory) => void): () => void {
  opener = fn;
  return () => {
    if (opener === fn) opener = null;
  };
}

export function openFeedback(category: FeedbackCategory = 'bug'): void {
  opener?.(category);
}

export function setPendingCrash(error: FeedbackContext['error']): void {
  pendingCrash = error;
}

/** Read and clear, so a later report doesn't re-attach an earlier crash. */
export function takePendingCrash(): FeedbackContext['error'] {
  const value = pendingCrash;
  pendingCrash = undefined;
  return value;
}
