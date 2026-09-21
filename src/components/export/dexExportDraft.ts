import type { ViewSortOption } from '@/store/usePokedexStore';

export const DEX_EXPORT_SORTS = [
  'build-order',
  'regional',
  'national',
  'type',
  'custom',
] as const satisfies readonly ViewSortOption[];

export type DexExportDraft = {
  sort: ViewSortOption;
  showSections: boolean;
  groupSpecialAtEnd: boolean;
  customOrder: number[] | null;
  showStats: boolean;
};

export function dexExportFrameKey(draft: DexExportDraft): string {
  const outlines = draft.showSections && draft.sort === 'build-order' ? '1' : '0';
  const custom = draft.sort === 'custom' && draft.customOrder ? draft.customOrder.join('.') : '';
  return `${draft.sort}|o${outlines}|g${draft.groupSpecialAtEnd ? 1 : 0}|s${draft.showStats ? 1 : 0}|c${custom}`;
}

/** Live overlay encodes this draft only. Hidden permutations freeze pointer-tilt. */
export function dexExportLiveJobs(draft: DexExportDraft): DexExportDraft[] {
  return [draft];
}

export function dexExportPermutations(base: DexExportDraft, statsEnabled: boolean): DexExportDraft[] {
  const out: DexExportDraft[] = [];
  for (const sort of DEX_EXPORT_SORTS) {
    const groups = [base.groupSpecialAtEnd, !base.groupSpecialAtEnd];
    const stats = statsEnabled ? [base.showStats, !base.showStats] : [false];
    const outlines = sort === 'build-order' ? [true, false] : [false];
    for (const groupSpecialAtEnd of groups) {
      for (const showStats of stats) {
        for (const showSections of outlines) {
          out.push({
            ...base,
            sort,
            groupSpecialAtEnd,
            showStats,
            showSections,
          });
        }
      }
    }
  }
  const seen = new Set<string>();
  return out.filter((draft) => {
    const key = dexExportFrameKey(draft);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
