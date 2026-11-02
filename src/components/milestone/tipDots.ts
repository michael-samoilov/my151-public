import { useEffect } from 'react';
import { create } from 'zustand';

const TIP_TARGETS = [
  'dex-analytics',
  'dex-view',
  'dex-view-settings',
  'dex-export',
  'favorites-analytics',
  'favorites-export',
  'league-export',
  'league-card-export',
] as const;

export type TipTarget = (typeof TIP_TARGETS)[number];

type Dots = Readonly<Partial<Record<TipTarget, readonly TipTarget[]>>>;

const STORAGE_KEY = 'p151-tip-dots-v1';

function isTipTarget(value: unknown): value is TipTarget {
  return (TIP_TARGETS as readonly unknown[]).includes(value);
}

function readDots(): Dots {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const dots: Partial<Record<TipTarget, TipTarget[]>> = {};
    for (const [target, then] of Object.entries(saved)) {
      if (isTipTarget(target)) dots[target] = Array.isArray(then) ? then.filter(isTipTarget) : [];
    }
    return dots;
  } catch {
    return {};
  }
}

function writeDots(dots: Dots) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(dots));
  } catch { /* platform: Storage access can throw in private browsing. */ }
}

const useTipDots = create<{ dots: Dots }>(() => ({ dots: readDots() }));

function commit(dots: Dots) {
  writeDots(dots);
  useTipDots.setState({ dots });
}

export function showTipDot(target: TipTarget, then: readonly TipTarget[] = []) {
  const { dots } = useTipDots.getState();
  const current = dots[target];
  const next = [...new Set([...(current ?? []), ...then])];
  if (current && next.length === current.length) return;
  commit({ ...dots, [target]: next });
}

export function useTipDot(target: TipTarget): boolean {
  return useTipDots((s) => s.dots[target] !== undefined);
}

export function useTipVisit(target: TipTarget, visited: boolean) {
  useEffect(() => {
    if (!visited) return;
    const { dots } = useTipDots.getState();
    const then = dots[target];
    if (then === undefined) return;
    const next: Partial<Record<TipTarget, readonly TipTarget[]>> = { ...dots };
    delete next[target];
    for (const follow of then) next[follow] ??= [];
    commit(next);
  }, [target, visited]);
}
