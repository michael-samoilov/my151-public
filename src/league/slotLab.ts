import { create } from 'zustand';

/**
 * The ace/partner slot, opened up so its two halves can be dragged by hand.
 *
 * The geometry in `slotLayout.ts` is solved rather than drawn, which is right
 * for keeping it correct across widths and wrong for deciding what "right"
 * looks like in the first place. This lets a person move each half on the
 * real card — with the real pickers, the real empty states — and read off
 * where they put it.
 *
 * Offsets are **fractions of the slot**, not pixels. The slot is a different
 * size on every device, so a pixel nudge means nothing away from the screen
 * it was made on; a fraction transfers.
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

/**
 * The sprite the slot gave one Pokemon before it held two: `5.75rem`.
 *
 * The lab starts here rather than at whatever the solver's equal-size search
 * returns, because the search answers "what fits" and the question the lab is
 * for is "what should it be". Starting at the answer makes the lab agree with
 * the thing it is meant to replace.
 */
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
