import { createContext, useContext } from 'react';

export const SheetKeyboardContext = createContext(false);

export function useSheetKeyboard(): boolean {
  return useContext(SheetKeyboardContext);
}
