import { create } from 'zustand';
import { useFavoriteBrowserStore } from '@/components/browser/browserStore';
import type { BrowserStoreState } from '@/components/browser/browserStore';
import { getAllPokemon, getEvolutionLine, branchEndingAt } from '../data/catalog';
import { usePokedexStore } from '@/store/usePokedexStore';
import { CATEGORIES } from '@/data/categories';
import { t } from '@/i18n';
import { sendEventBeacon } from '@/hooks/useCompletionBeacon';
import { placedIds, type LegendPick } from '../model/engine';
import { BOSS_ROW, ROW_COUNT, TEAM_SIZES } from '../model/constants';
import { legendAt, useLeagueStore, type GymCard } from './useLeagueStore';
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

type ShinyRule = (switchOn: boolean) => boolean | 'keep';
const followSwitch: ShinyRule = (on) => on;
const onlyWhenOn: ShinyRule = (on) => (on ? true : 'keep');

/**
 * The shiny flag a tap gives, by what was tapped (a new pick, or a Pokémon the
 * card already holds) and why the browser is open. Tapping a held line to
 * replace or duplicate it is how a line changes look.
 */
const SHINY_FLAG: Record<'pick' | 'held', Record<BrowserPurpose, ShinyRule>> = {
  pick: { lines: followSwitch, replace: followSwitch, signature: followSwitch, partner: followSwitch, legend: followSwitch },
  held: { lines: followSwitch, replace: followSwitch, signature: onlyWhenOn, partner: followSwitch, legend: followSwitch },
};

/**
 * Whether the Shiny switch starts on, by why the browser opens: on only over a
 * pick that is shiny, because a tap on a held pick with the switch off turns it
 * back to normal.
 */
const SHINY_AT_OPEN: Record<BrowserPurpose, (card: GymCard, seat: number) => boolean> = {
  lines: () => false,
  replace: (card, seat) => card.lines[seat - 1]?.shiny === true,
  signature: () => false,
  partner: (card) => card.partnerShiny === true,
  legend: (card, seat) => legendAt(card, seat)?.shiny === true,
};

const legendPick = (pokemonId: number, seat: number, shiny: boolean): LegendPick => (shiny ? { pokemonId, seat, shiny: true } : { pokemonId, seat });

interface BridgeState extends BrowserStoreState {
  shinyView: boolean;
  openFor: (card: number) => void;
  refresh: () => void;
  typeBeforeScope?: string[] | null;
}

/**
 * What the browser shows when it opens on a card for a purpose. My dex and the
 * team scope stay as the last open left them, so `kept` passes them in.
 */
export function pickerOpenState(
  card: number,
  purpose: BrowserPurpose,
  kept: Pick<BridgeState, 'myDexFilter' | 'scopeFilter'>,
  targetSeat: number,
) {
  const gym = useLeagueStore.getState().cards[card];
  const type = gym?.type ?? null;
  const lines = gym?.lines ?? [];
  const placed = new Set(placedIds(lines));
  const cardFull = lines.length >= TEAM_SIZES[BOSS_ROW - 1];
  const scopeLocked = purpose === 'signature' && cardFull;
  const scoped = purpose === 'signature' || purpose === 'partner';
  const scopeOn = scoped && lines.length > 0
    ? (scopeLocked || (kept.scopeFilter ?? false))
    : false;
  const gymType: string[] | null = type && type !== 'none' ? [type] : null;
  return {
    activeSection: sectionKey(card),
    sections: { [sectionKey(card)]: placedIds(lines) },
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
    myDexFilter: kept.myDexFilter ?? false,
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
    shinyView: gym ? SHINY_AT_OPEN[purpose](gym, targetSeat) : false,
  } satisfies Partial<BridgeState>;
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
    shinyView: false,

    openFor: (card) => {
      useFavoriteBrowserStore.getState().refreshFavorites();
      set(pickerOpenState(card, ui().browserPurpose, get(), ui().targetSeat));
    },

    refresh: () => set({ sections: mirror() }),

    addToSection: (_sectionId, ids) => {
      if (ids.length === 0) return;
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      const shiny = SHINY_FLAG.pick[purpose](get().shinyView) === true;
      const branch = branchEndingAt(ids[ids.length - 1], ids);
      if (purpose === 'legend') {
        league().setLegend(card, legendPick(branch[branch.length - 1], ui().targetSeat, shiny));
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        league().replaceLine(card, ui().targetSeat, branch, shiny);
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        const picked = ids[ids.length - 1];
        const line = lineThrough(picked);
        const before = league().cards[card]?.lines.length ?? 0;
        league().placeBranch(card, line, 'front', shiny);
        if ((league().cards[card]?.lines.length ?? 0) > before) fieldStage(card, 1, line, picked);
        league().setSignatureSeat(card, 1, picked);
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        const picked = ids[ids.length - 1];
        const line = lineThrough(picked);
        const before = league().cards[card]?.lines.length ?? 0;
        league().placeBranch(card, line, 'end', shiny);
        const after = league().cards[card]?.lines.length ?? 0;
        if (after > before) fieldStage(card, after, line, picked);
        league().setPartner(card, picked, shiny);
        ui().closeBrowser();
      } else {
        league().placeBranch(card, branch, 'end', shiny);
      }
      get().refresh();
    },

    removeEvoLine: (_sectionId, pokemonId) => {
      const card = cardIndex();
      const purpose = ui().browserPurpose;
      const shiny = SHINY_FLAG.held[purpose](get().shinyView);
      if (purpose === 'legend') {
        const final = branchEndingAt(pokemonId).pop();
        if (final !== undefined) {
          useLeagueStore.getState().setLegend(card, legendPick(final, ui().targetSeat, shiny === true));
        }
        ui().closeBrowser();
      } else if (purpose === 'replace') {
        const seat = ui().targetSeat;
        const lines = useLeagueStore.getState().cards[card]?.lines ?? [];
        const held = lines.find((l) => l.branch.includes(pokemonId));
        const own = lines[seat - 1];
        if (own?.branch.includes(pokemonId)) {
          useLeagueStore.getState().setLineShiny(card, seat, shiny === true);
        } else {
          useLeagueStore.getState().replaceLine(card, seat, held ? [...held.branch] : branchEndingAt(pokemonId), shiny === true);
        }
        ui().closeBrowser();
      } else if (purpose === 'signature') {
        const seat =
          useLeagueStore.getState().cards[card]?.lines.findIndex((l) => l.branch.includes(pokemonId)) ?? -1;
        if (seat >= 0) {
          useLeagueStore.getState().setSignatureSeat(card, seat + 1, pokemonId);
          if (shiny !== 'keep') useLeagueStore.getState().setLineShiny(card, seat + 1, shiny);
        }
        ui().closeBrowser();
      } else if (purpose === 'partner') {
        useLeagueStore.getState().setPartner(card, pokemonId, shiny === true);
        ui().closeBrowser();
      } else {
        const held = useLeagueStore.getState().cards[card]?.lines.find((l) => l.branch.includes(pokemonId));
        useLeagueStore.getState().placeBranch(card, held ? [...held.branch] : branchEndingAt(pokemonId), 'end', shiny === true);
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
    setShinyView: (on) => {
      // Only the browser's Shiny switch calls this, so it counts that switch turned on.
      if (on) sendEventBeacon('league-shiny-on', { once: true });
      set({ shinyView: on });
    },
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
