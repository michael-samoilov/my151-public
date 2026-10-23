import { create } from 'zustand';
import type { LeagueNudgeId } from '../model/funnelNudges';

export type BrowserPurpose = 'lines' | 'signature' | 'partner' | 'legend' | 'replace';

type LeagueExportPhase = 'settings' | 'surveyIntro' | 'survey';

interface LeagueUiState {
  openCard: number | null;
  exportOpen: boolean;
  exportCardIndex: number | null;
  exportPhase: LeagueExportPhase;
  lastCard: number;
  browserOpen: boolean;
  browserPurpose: BrowserPurpose;
  targetSeat: number;
  replacingId: number | null;
  movePickerOpen: boolean;
  typePickerOpen: boolean;
  activeNudge: LeagueNudgeId | null;

  openCardPage: (card: number) => void;
  closeCardPage: () => void;
  openBrowser: (purpose: BrowserPurpose, targetSeat?: number, replacingId?: number | null) => void;
  closeBrowser: () => void;
  setMovePickerOpen: (open: boolean) => void;
  setTypePickerOpen: (open: boolean) => void;

  openLeagueExport: (cardIndex?: number) => void;
  closeLeagueExport: () => void;
  setExportPhase: (phase: LeagueExportPhase) => void;
  armNudge: (id: LeagueNudgeId) => void;
  dismissNudge: () => void;
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
  exportOpen: false,
  exportCardIndex: null,
  exportPhase: 'settings',
  activeNudge: null,

  openCardPage: (card) => set({ openCard: card, lastCard: card }),
  closeCardPage: () =>
    set({ openCard: null, browserOpen: false, movePickerOpen: false, typePickerOpen: false }),
  openBrowser: (purpose, targetSeat = 1, replacingId = null) =>
    set({ browserOpen: true, browserPurpose: purpose, targetSeat, replacingId }),
  closeBrowser: () => set({ browserOpen: false }),
  setMovePickerOpen: (open) => set({ movePickerOpen: open }),
  setTypePickerOpen: (open) => set({ typePickerOpen: open }),

  openLeagueExport: (cardIndex) =>
    set({
      exportOpen: true,
      exportCardIndex: cardIndex ?? null,
      exportPhase: 'settings',
    }),
  closeLeagueExport: () =>
    set({ exportOpen: false, exportCardIndex: null, exportPhase: 'settings' }),
  setExportPhase: (phase) => set({ exportPhase: phase }),
  armNudge: (id) => set({ activeNudge: id }),
  dismissNudge: () => set({ activeNudge: null }),
}));
