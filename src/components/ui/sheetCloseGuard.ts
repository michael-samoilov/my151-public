import { createContext, useContext, useEffect } from 'react';

/** The four ways a `BottomSheet` is asked to close. */
export type SheetCloseVia = 'handle' | 'scrim' | 'swipe' | 'escape';

/**
 * Runs before a sheet closes. Returns true when it takes the request over, and
 * the sheet then stays open.
 */
export type SheetCloseGuard = (via: SheetCloseVia) => boolean;

/**
 * The open sheet's guard slot, so content inside a sheet can hold a close: the
 * Pokémon picker asks about staged picks before a close drops them. Null
 * outside a sheet.
 *
 * Its own file for the same Fast Refresh reason as `sheetKeyboard.ts`.
 */
export const SheetCloseGuardContext = createContext<((guard: SheetCloseGuard | null) => void) | null>(null);

/** Put `guard` in front of the enclosing sheet's close. Does nothing outside a sheet. */
export function useSheetCloseGuard(guard: SheetCloseGuard): void {
  const register = useContext(SheetCloseGuardContext);
  useEffect(() => {
    if (!register) return;
    register(guard);
    return () => register(null);
  }, [register, guard]);
}
