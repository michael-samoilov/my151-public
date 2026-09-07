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

/**
 * What opened the form, when there is one.
 *
 * The desktop card anchors itself to this element, so a report started from the
 * bug icon opens beside the bug icon rather than in a corner the eye has to go
 * find. A caller with nothing sensible to point at — the crash screen, whose
 * own button is about to be replaced by the form — passes nothing, and the card
 * falls back to its corner.
 */
export type FeedbackAnchor = HTMLElement | null;

let opener: ((category: FeedbackCategory, anchor: FeedbackAnchor) => void) | null = null;
let pendingCrash: FeedbackContext['error'] = undefined;

/** Called by the mounted button; returns the teardown. */
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

export function setPendingCrash(error: FeedbackContext['error']): void {
  pendingCrash = error;
}

/** Read and clear, so a later report doesn't re-attach an earlier crash. */
export function takePendingCrash(): FeedbackContext['error'] {
  const value = pendingCrash;
  pendingCrash = undefined;
  return value;
}
