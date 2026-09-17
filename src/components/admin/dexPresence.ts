import { useLayoutEffect, useMemo, type RefObject } from 'react';

const ABSENT_OPACITY = '0.14';

export function applyDexPresence(root: ParentNode, present: ReadonlySet<number>): void {
  for (const node of root.querySelectorAll('[data-dex-id]')) {
    const el = node as HTMLElement;
    el.style.opacity = present.has(Number(el.dataset.dexId)) ? '1' : ABSENT_OPACITY;
  }
}

export function idsOutsideSections(
  idLists: readonly (readonly number[])[],
  sectioned: ReadonlySet<number>,
): number[] {
  const seen = new Set<number>();
  const out: number[] = [];
  for (const ids of idLists) {
    for (const id of ids) {
      if (sectioned.has(id) || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

export function keepMountedSections(
  latest: Record<string, number[]> | undefined,
  historicalMaps: readonly (Record<string, number[]> | undefined)[],
  recordedIds: ReadonlySet<number>,
): Record<string, number[]> {
  const placed = new Set<number>();
  const out: Record<string, number[]> = {};
  const take = (map: Record<string, number[]> | undefined) => {
    if (!map) return;
    for (const [sid, ids] of Object.entries(map)) {
      for (const id of ids) {
        if (placed.has(id) || !recordedIds.has(id)) continue;
        placed.add(id);
        (out[sid] ??= []).push(id);
      }
    }
  };
  take(latest);
  for (const map of historicalMaps) take(map);
  return out;
}

export function useDexPresence(
  rootRef: RefObject<HTMLElement | null>,
  presentIds: number[],
  sessionIds?: number[][],
) {
  const present = useMemo(() => new Set(presentIds), [presentIds]);
  const bySession = useMemo(
    () => sessionIds?.map((ids) => new Set(ids)),
    [sessionIds],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    applyDexPresence(root, present);
  }, [present, rootRef]);

  useLayoutEffect(() => {
    if (!bySession) return;
    const applyFromSlider = () => {
      const root = rootRef.current;
      const el = document.querySelector('input[aria-label="Scrub sessions"]');
      if (!root || !(el instanceof HTMLInputElement)) return;
      const i = Number(el.value);
      if (!Number.isFinite(i) || i < 0 || i >= bySession.length) return;
      applyDexPresence(root, bySession[i]);
    };
    document.addEventListener('input', applyFromSlider, true);
    applyFromSlider();
    return () => document.removeEventListener('input', applyFromSlider, true);
  }, [bySession, rootRef]);
}
