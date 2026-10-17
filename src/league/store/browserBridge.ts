import { create } from 'zustand';
import { useFavoriteBrowserStore } from '@/components/browser/browserStore';
import type { BrowserStoreState } from '@/components/browser/browserStore';
import { getAllPokemon, getEvolutionLine, branchEndingAt } from '../data/catalog';
import { usePokedexStore } from '@/store/usePokedexStore';
import { CATEGORIES } from '@/data/categories';
import { t } from '@/i18n';
import { placedIds } from '../model/engine';
import { BOSS_ROW, ROW_COUNT, TEAM_SIZES } from '../model/constants';
import { useLeagueStore } from './useLeagueStore';
import { useLeagueUi, type BrowserPurpose } from './useLeagueUi';

const LEGEND_ELIGIBLE: Set<number> = (() => {
  const ub = CATEGORIES.find((c) => c.id === 'ultra-beast');
  return new Set(
    getAllPokemon()
      .filter((p) => p.isLegendary || p.isMythical || (ub?.filter?.(p) ?? false))
      .map((p) => p.id),
  );
})();

function lineThrough(pokemonId: number): number[] {
  const line = getEvolutionLine(pokemonId).map((p) => p.id);
  return line.includes(pokemonId) ? line : branchEndingAt(pokemonId);
}

function fieldStage(card: number, seat: number, branch: number[], pokemonId: number): void {
  const stage = branch.indexOf(pokemonId);
  if (stage < 0 || stage >= branch.length - 1) return;
  useLeagueStore.getState().setStageBoundary(card, seat, stage + 1, ROW_COUNT + 1);
}

function sectionKey(card: number): string {
  return `slot-${card}`;
}

interface BridgeState extends BrowserStoreState {
  openFor: (card: number) => void;
  refresh: () => void;
  typeBeforeScope?: string[] | null;
}

export const useLeagueBrowserStore = create<BridgeState>()((set, get) => {
  const ui = () => useLeagueUi.getState();
  const league = () => useLeagueStore.getState();

  const cardIndex = () => {
    const open = ui().openCard;
    return open ?? 0;
  };

  const mirror = () => {
    const card = league().cards[cardIndex()];
    return { [sectionKey(cardIndex())]: card ? placedIds(card.lines) : [] };
  };

  return {
    sections: {},
    activeSection: null,
    activeCategoryFilter: null,
    activeArchetypeFilter: null,
    searchQuery: '',
    typeFilter: null,
    typeFilterMode: 'any',
    generationFilter: null,
    shapeFilter: null,
    colorFilter: null,
    eggGroupFilter: null,
    evoLineSizeFilter: null,
    myDexFilter: false,
    myDexIds: new Set<number>(),
    myDexSections: undefined,
    restrictIds: undefined,
    scopeFilter: false,
    scopeFilterIds: undefined,
    scopeFilterLabel: undefined,
    scopeFilterLines: undefined,
    scopeFilterLocked: false,
    scopeFilterLockedHint: undefined,
    typeBeforeScope: null,
    standaloneTiles: false,

    openFor: (card) => {
      useFavoriteBrowserStore.getState().refreshFavorites();
      const purpose = ui().browserPurpose;
      const type = league().cards[card]?.type ?? null;
      const lines = league().cards[card]?.lines ?? [];
      const placed = new Set(placedIds(lines));
      const cardFull = lines.length >= TEAM_SIZES[BOSS_ROW - 1];
      const scopeLocked = purpose === 'signature' && cardFull;
      const scoped = purpose === 'signature' || purpose === 'partner';
      const scopeOn = scoped && lines.length > 0
        ? (scopeLocked || (get().scopeFilter ?? false))
        : false;
      const gymType: string[] | null = type && type !== 'none' ? [type] : null;
      set({
        activeSection: sectionKey(card),
        sections: { [sectionKey(card)]: placedIds(league().cards[card]?.lines ?? []) },
        searchQuery: '',
        activeCategoryFilter: null,
        activeArchetypeFilter: null,
        typeFilter: scopeOn ? null : gymType,
        typeBeforeScope: scopeOn ? gymType : null,
        typeFilterMode: 'any',
        generationFilter: null,
        shapeFilter: null,
        colorFilter: null,
        eggGroupFilter: null,
        evoLineSizeFilter: null,
        myDexFilter: get().myDexFilter ?? false,
        myDexIds: new Set(Object.values(usePokedexStore.getState().sections).flat()),
        myDexSections: usePokedexStore.getState().sections,
        restrictIds:
          purpose === 'legend'
            ? LEGEND_ELIGIBLE
            : purpose === 'signature' && cardFull
              ? placed
              : undefined,
        scopeFilter: scopeOn,
        scopeFilterIds: scoped && lines.length > 0 ? placed : undefined,
        scopeFilterLabel: scoped && lines.length > 0 ? t('league.scope.team') : undefined,
        scopeFilterLocked: scopeLocked,
        scopeFilterLockedHint: scopeLocked ? t('league.scope.locked') : undefined,
        scopeFilterLines: scoped ? lines.map((l) => l.branch) : undefined,
        standaloneTiles: purpose === 'signature' || purpose === 'legend' || purpose === 'partner',
      });
    },

    refresh: () => set({ sections: mirror() }),

    addToSection: (_sectionId, ids) => {
      if (ids.length === 0) return;
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      const branch = branchEndingAt(ids[ids.length - 1], ids);
      if (purpose === 'legend') {
        league().setLegend(card, {
          pokemonId: branch[branch.length - 1],
          seat: ui().targetSeat,
        });
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        league().replaceLine(card, ui().targetSeat, branch);
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        const picked = ids[ids.length - 1];
        const line = lineThrough(picked);
        const before = league().cards[card]?.lines.length ?? 0;
        league().placeBranch(card, line, 'front');
        if ((league().cards[card]?.lines.length ?? 0) > before) fieldStage(card, 1, line, picked);
        league().setSignatureSeat(card, 1, picked);
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        const picked = ids[ids.length - 1];
        const line = lineThrough(picked);
        const before = league().cards[card]?.lines.length ?? 0;
        league().placeBranch(card, line);
        const after = league().cards[card]?.lines.length ?? 0;
        if (after > before) fieldStage(card, after, line, picked);
        league().setPartner(card, picked);
        ui().closeBrowser();
      } else {
        league().placeBranch(card, branch);
      }
      get().refresh();
    },

    removeEvoLine: (_sectionId, pokemonId) => {
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      if (purpose === 'legend') {
        const final = branchEndingAt(pokemonId).pop();
        if (final !== undefined) {
          useLeagueStore.getState().setLegend(card, { pokemonId: final, seat: ui().targetSeat });
        }
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        const seat = ui().targetSeat;
        const lines = useLeagueStore.getState().cards[card]?.lines ?? [];
        const held = lines.find((l) => l.branch.includes(pokemonId));
        const own = lines[seat - 1];
        if (!own?.branch.includes(pokemonId)) {
          useLeagueStore.getState().replaceLine(card, seat, held ? [...held.branch] : branchEndingAt(pokemonId));
        }
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        const seat =
          useLeagueStore.getState().cards[card]?.lines.findIndex((l) => l.branch.includes(pokemonId)) ?? -1;
        if (seat >= 0) useLeagueStore.getState().setSignatureSeat(card, seat + 1, pokemonId);
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        useLeagueStore.getState().setPartner(card, pokemonId);
        ui().closeBrowser();
      } else {
        const held = useLeagueStore.getState().cards[card]?.lines.find((l) => l.branch.includes(pokemonId));
        useLeagueStore.getState().placeBranch(card, held ? [...held.branch] : branchEndingAt(pokemonId));
      }
      get().refresh();
    },

    setActiveSection: (sectionId) => {
      if (sectionId === null) ui().closeBrowser();
      set({ activeSection: sectionId });
    },
    setMobileBrowserOpen: (open) => {
      if (!open) ui().closeBrowser();
    },

    setCategoryFilter: (category) => set({ activeCategoryFilter: category, activeArchetypeFilter: null }),
    setArchetypeFilter: (archetype) => set({ activeArchetypeFilter: archetype, activeCategoryFilter: null }),
    setSearchQuery: (searchQuery) => set({ searchQuery }),
    setTypeFilter: (typeFilter) => set({ typeFilter }),
    setTypeFilterMode: (typeFilterMode) => set({ typeFilterMode }),
    toggleType: (type) =>
      set((s) => {
        const cur = s.typeFilter ?? [];
        const next = cur.includes(type) ? cur.filter((t) => t !== type) : [...cur, type];
        return { typeFilter: next.length > 0 ? next : null };
      }),
    setGenerationFilter: (generationFilter) => set({ generationFilter }),
    toggleGeneration: (gen) =>
      set((s) => {
        const cur = s.generationFilter ?? [];
        const next = cur.includes(gen) ? cur.filter((g) => g !== gen) : [...cur, gen];
        return { generationFilter: next.length > 0 ? next : null };
      }),
    setShapeFilter: (shapeFilter) => set({ shapeFilter }),
    toggleShape: (shape) =>
      set((s) => {
        const cur = s.shapeFilter ?? [];
        const next = cur.includes(shape) ? cur.filter((x) => x !== shape) : [...cur, shape];
        return { shapeFilter: next.length > 0 ? next : null };
      }),
    setColorFilter: (colorFilter) => set({ colorFilter }),
    toggleColor: (color) =>
      set((s) => {
        const cur = s.colorFilter ?? [];
        const next = cur.includes(color) ? cur.filter((x) => x !== color) : [...cur, color];
        return { colorFilter: next.length > 0 ? next : null };
      }),
    setEggGroupFilter: (eggGroupFilter) => set({ eggGroupFilter }),
    toggleEggGroup: (group) =>
      set((s) => {
        const cur = s.eggGroupFilter ?? [];
        const next = cur.includes(group) ? cur.filter((x) => x !== group) : [...cur, group];
        return { eggGroupFilter: next.length > 0 ? next : null };
      }),
    setEvoLineSizeFilter: (evoLineSizeFilter) => set({ evoLineSizeFilter }),
    setMyDexFilter: (on) => set({ myDexFilter: on }),
    setScopeFilter: (on) =>
      set((s) => {
        if (on) {
          return { scopeFilter: true, typeFilter: null, typeBeforeScope: s.typeFilter };
        }
        const restore = (s.typeFilter?.length ?? 0) > 0 ? s.typeFilter : (s.typeBeforeScope ?? null);
        return { scopeFilter: false, typeFilter: restore, typeBeforeScope: null };
      }),
  };
});

export function openLeagueBrowser(
  card: number,
  purpose: BrowserPurpose,
  targetSeat = 1,
  replacingId: number | null = null,
): void {
  useLeagueUi.getState().openBrowser(purpose, targetSeat, replacingId);
  useLeagueBrowserStore.getState().openFor(card);
}
