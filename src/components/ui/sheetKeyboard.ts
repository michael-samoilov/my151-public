import { createContext, useContext } from 'react';

/**
 * Whether an open `BottomSheet` is currently sharing the screen with an
 * on-screen keyboard.
 *
 * Its own file rather than a second export from `BottomSheet.tsx`, because a
 * module that exports both a component and a plain value opts out of React Fast
 * Refresh for the whole file — `react-refresh/only-export-components` is an
 * error here, not a style note.
 *
 * Content inside a sheet gets to react to the keyboard. The sheet can tighten
 * its own chrome, but the padding and gaps of a form it knows nothing about are
 * the form's to give up — and with a keyboard open they are the difference
 * between a field two lines tall and one worth typing into.
 */
export const SheetKeyboardContext = createContext(false);

export function useSheetKeyboard(): boolean {
  return useContext(SheetKeyboardContext);
}
