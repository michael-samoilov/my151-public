import { useEffect } from 'react';
import { create } from 'zustand';

/** Every toolbar button a tip can point at. Each one carries `data-tip-target` with its id. */
const TIP_TARGETS = [
  'dex-analytics',
  'dex-view',
  'dex-export',
  'favorites-analytics',
  'favorites-export',
  'league-export',
  'league-card-export',
] as const;

export type TipTarget = (typeof TIP_TARGETS)[number];

const STORAGE_KEY = 'p151-tip-dots-v1';

function isTipTarget(value: unknown): value is TipTarget {
  return (TIP_TARGETS as readonly unknown[]).includes(value);
}

function readDots(): ReadonlySet<TipTarget> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(saved) ? saved.filter(isTipTarget) : []);
  } catch {
    return new Set();
  }
}

function writeDots(dots: ReadonlySet<TipTarget>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...dots]));
  } catch { /* Storage can be unavailable in private browsing. */ }
}

const useTipDots = create<{ dots: ReadonlySet<TipTarget> }>(() => ({ dots: readDots() }));

function setDot(target: TipTarget, on: boolean) {
  const { dots } = useTipDots.getState();
  if (dots.has(target) === on) return;
  const next = new Set(dots);
  if (on) next.add(target);
  else next.delete(target);
  writeDots(next);
  useTipDots.setState({ dots: next });
}

/**
 * A tip marks its target with a dot when the tip appears. The dot outlives the tip,
 * reloads included, and goes only when the person visits the target.
 */
export function showTipDot(target: TipTarget) {
  setDot(target, true);
}

export function useTipDot(target: TipTarget): boolean {
  return useTipDots((s) => s.dots.has(target));
}

/** Clears the target's dot once the person is on the place it opens. */
export function useTipVisit(target: TipTarget, visited: boolean) {
  useEffect(() => {
    if (visited) setDot(target, false);
  }, [target, visited]);
}
