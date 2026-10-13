import type { FeedbackCategory } from '@/lib/feedbackContext';

/**
 * How anything outside the feedback tree opens the report form.
 *
 * A module-level channel rather than props or store state: the footer link
 * lives in three different pages' trees and none of them is an ancestor of the
 * button.
 */

/**
 * What opened the form, when there is one.
 *
 * The desktop card anchors itself to this element, so a report started from the
 * bug icon opens beside the bug icon rather than in a corner the eye has to go
 * find. A caller with nothing sensible to point at passes nothing, and the card
 * falls back to its corner.
 */
export type FeedbackAnchor = HTMLElement | null;

let opener: ((category: FeedbackCategory, anchor: FeedbackAnchor) => void) | null = null;

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
