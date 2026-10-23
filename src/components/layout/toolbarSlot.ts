import { createContext, useContext } from 'react';
import type { AppView } from '@/components/layout/Header';

interface ToolbarSlot {
  el: HTMLElement | null;
  view: AppView;
}

export const ToolbarSlotContext = createContext<ToolbarSlot>({ el: null, view: 'builder' });

export function useToolbarSlot(view: AppView): HTMLElement | null {
  const slot = useContext(ToolbarSlotContext);
  return slot.view === view ? slot.el : null;
}
