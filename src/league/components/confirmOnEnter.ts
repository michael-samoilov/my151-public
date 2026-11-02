import type { KeyboardEvent } from 'react';

// platform: A blur is what closes the phone keyboard, on iOS and Android alike, so Enter blurs the field.
export function confirmOnEnter(e: KeyboardEvent<HTMLInputElement>): void {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  e.currentTarget.blur();
}
