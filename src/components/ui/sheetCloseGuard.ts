import { createContext, useContext, useEffect } from 'react';

export type SheetCloseVia = 'handle' | 'scrim' | 'swipe' | 'escape';

export type SheetCloseGuard = (via: SheetCloseVia) => boolean;

export const SheetCloseGuardContext = createContext<((guard: SheetCloseGuard | null) => void) | null>(null);

export function useSheetCloseGuard(guard: SheetCloseGuard): void {
  const register = useContext(SheetCloseGuardContext);
  useEffect(() => {
    if (!register) return;
    register(guard);
    return () => register(null);
  }, [register, guard]);
}
