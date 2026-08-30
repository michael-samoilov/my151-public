import { create } from 'zustand';

/**
 * Transient league-page UI state. Never persisted: a reload lands on the
 * league home with everything closed, which is also the crawler's view.
 */

export type BrowserPurpose = 'lines' | 'signature' | 'legend' | 'replace';

interface LeagueUiState {
  /** null = league home; a number = that card is open full-screen. */
  openCard: number | null;
  /**
   * The card the pane last held. Mobile keeps both panes on one sliding
   * track, so the card must stay drawn while it slides back out — closing
   * pans away from what was there rather than from a blank.
   */
  lastCard: number;
  browserOpen: boolean;
  browserPurpose: BrowserPurpose;
  /** The seat the pick applies to: the boss seat a legendary overlays, or
   *  the seat whose line is being replaced. */
  targetSeat: number;
  /** The Pokémon that was pressed to start a replacement, for the heading. */
  replacingId: number | null;
  movePickerOpen: boolean;
  typePickerOpen: boolean;

  openCardPage: (card: number) => void;
  closeCardPage: () => void;
  openBrowser: (purpose: BrowserPurpose, targetSeat?: number, replacingId?: number | null) => void;
  closeBrowser: () => void;
  setMovePickerOpen: (open: boolean) => void;
  setTypePickerOpen: (open: boolean) => void;
}

export const useLeagueUi = create<LeagueUiState>()((set) => ({
  openCard: null,
  lastCard: 0,
  browserOpen: false,
  browserPurpose: 'lines',
  targetSeat: 1,
  replacingId: null,
  movePickerOpen: false,
  typePickerOpen: false,

  openCardPage: (card) => set({ openCard: card, lastCard: card }),
  closeCardPage: () =>
    set({ openCard: null, browserOpen: false, movePickerOpen: false, typePickerOpen: false }),
  openBrowser: (purpose, targetSeat = 1, replacingId = null) =>
    set({ browserOpen: true, browserPurpose: purpose, targetSeat, replacingId }),
  closeBrowser: () => set({ browserOpen: false }),
  setMovePickerOpen: (open) => set({ movePickerOpen: open }),
  setTypePickerOpen: (open) => set({ typePickerOpen: open }),
}));
