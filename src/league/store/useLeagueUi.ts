import { create } from 'zustand';

/**
 * Transient league-page UI state. Never persisted: a reload lands on the
 * league home with everything closed, which is also the crawler's view.
 */

export type BrowserPurpose = 'lines' | 'signature' | 'legend';

interface LeagueUiState {
  /** null = league home; a number = that card is open full-screen. */
  openCard: number | null;
  browserOpen: boolean;
  browserPurpose: BrowserPurpose;
  /** Boss-row seat a legend pick will overlay. */
  legendSeat: number;
  movePickerOpen: boolean;
  typePickerOpen: boolean;

  openCardPage: (card: number) => void;
  closeCardPage: () => void;
  openBrowser: (purpose: BrowserPurpose, legendSeat?: number) => void;
  closeBrowser: () => void;
  setMovePickerOpen: (open: boolean) => void;
  setTypePickerOpen: (open: boolean) => void;
}

export const useLeagueUi = create<LeagueUiState>()((set) => ({
  openCard: null,
  browserOpen: false,
  browserPurpose: 'lines',
  legendSeat: 1,
  movePickerOpen: false,
  typePickerOpen: false,

  openCardPage: (card) => set({ openCard: card }),
  closeCardPage: () =>
    set({ openCard: null, browserOpen: false, movePickerOpen: false, typePickerOpen: false }),
  openBrowser: (purpose, legendSeat = 1) =>
    set({ browserOpen: true, browserPurpose: purpose, legendSeat }),
  closeBrowser: () => set({ browserOpen: false }),
  setMovePickerOpen: (open) => set({ movePickerOpen: open }),
  setTypePickerOpen: (open) => set({ typePickerOpen: open }),
}));
