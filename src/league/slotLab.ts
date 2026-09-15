import { create } from 'zustand';

/**
 * The ace/partner slot, opened up so its two halves can be dragged by hand.
 *
 * Off by default and off in production. `SlotLabPage` is the only thing that
 * turns it on, and that page does not mount on the live deploy.
 */

export interface SlotOffset {
  /** Fraction of the slot's width, positive to the right. */
  dx: number;
  /** Fraction of the slot's height, positive downward. */
  dy: number;
}

/** Lab slider default, in the card's own pixels. */
export const STANDARD_SPRITE = 92;

interface SlotLabState {
  enabled: boolean;
  ace: SlotOffset;
  partner: SlotOffset;
  /** Both halves' sprite edge, in the card's own pixels. */
  sprite: number;
  /** The slot's measured size, so the page can show pixels beside fractions. */
  slot: { w: number; h: number } | null;
  enable: () => void;
  nudge: (half: 'ace' | 'partner', dx: number, dy: number) => void;
  setSprite: (px: number) => void;
  setSlot: (w: number, h: number) => void;
  reset: () => void;
}

const ZERO: SlotOffset = { dx: 0, dy: 0 };

export const useSlotLab = create<SlotLabState>()((set) => ({
  enabled: false,
  ace: ZERO,
  partner: ZERO,
  sprite: STANDARD_SPRITE,
  slot: null,
  enable: () => set({ enabled: true }),
  nudge: (half, dx, dy) =>
    set((s) => ({ [half]: { dx: s[half].dx + dx, dy: s[half].dy + dy } }) as Partial<SlotLabState>),
  setSprite: (px) => set({ sprite: Math.max(16, Math.min(160, Math.round(px))) }),
  setSlot: (w, h) => set((s) => (s.slot && s.slot.w === w && s.slot.h === h ? s : { slot: { w, h } })),
  reset: () => set({ ace: ZERO, partner: ZERO, sprite: STANDARD_SPRITE }),
}));
