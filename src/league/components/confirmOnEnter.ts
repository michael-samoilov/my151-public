import type { KeyboardEvent } from 'react';

/**
 * Enter confirms a one-line field and puts the keyboard away.
 *
 * The league name and the theme save on every keystroke, so there is nothing
 * to submit. But on a phone the keyboard stays up until something else takes
 * the focus, and Enter is the key a thumb reaches for to say "done". Blurring
 * the field is what closes the keyboard, on iOS and on Android alike.
 */
export function confirmOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.currentTarget.blur();
}
