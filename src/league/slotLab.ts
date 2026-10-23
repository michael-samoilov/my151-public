import { create } from 'zustand';

interface SlotOffset {
  dx: number;
  dy: number;
}

export const STANDARD_SPRITE = 92;

interface SlotLabState {
  enabled: boolean;
  ace: SlotOffset;
  partner: SlotOffset;
  sprite: number;
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
