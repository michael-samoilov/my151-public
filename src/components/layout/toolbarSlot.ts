import { createContext, useContext } from 'react';
import type { AppView } from '@/components/layout/Header';

/**
 * The second header's right-aligned cell, offered to pages as a portal
 * target. Pages own their controls (the view page's export button leans on
 * deep page state), the header owns the row — a portal joins the two. All
 * pages stay mounted once visited, so each portal is gated on its own view
 * being the active one.
 */

export interface ToolbarSlot {
  el: HTMLElement | null;
  view: AppView;
}

export const ToolbarSlotContext = createContext<ToolbarSlot>({ el: null, view: 'builder' });

/** The portal target while `view` is active; null otherwise. */
export function useToolbarSlot(view: AppView): HTMLElement | null {
  const slot = useContext(ToolbarSlotContext);
  return slot.view === view ? slot.el : null;
}
