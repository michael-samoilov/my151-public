import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { setFitMode, useFitMode, type FitMode } from '../fitMode';

// Preview only: compare the desktop sprite fits on a real screen.

const OPTIONS: readonly { mode: FitMode; label: string; hint: string }[] = [
  { mode: 'fluid', label: 'Production', hint: 'Fills the pane. Sprites can land between whole pixels.' },
  { mode: 'down', label: 'A: shrink', hint: 'Shrinks to the largest sharp size that fits the pane.' },
  { mode: 'up', label: 'B: grow', hint: 'Grows to the next sharp size when the pane scrolls 10% or less. Else A.' },
];

const KEY_MODES: Record<string, FitMode> = { '1': 'fluid', '2': 'down', '3': 'up' };

function spriteScales(rootSel: string): number[] {
  const root = document.querySelector(rootSel);
  if (!root) return [];
  const scales = new Set<number>();
  for (const img of root.querySelectorAll<HTMLImageElement>('img[src*="/sprites/pokemon/"]')) {
    if (!img.naturalWidth) continue;
    const width = img.getBoundingClientRect().width;
    if (width > 0) scales.add(Math.round(((width * devicePixelRatio) / img.naturalWidth) * 100) / 100);
  }
  return [...scales].sort((a, b) => a - b);
}

function Readout({ name, scales }: { name: string; scales: number[] }) {
  if (scales.length === 0) return null;
  const sharp = scales.every((s) => s >= 1 && Math.abs(s - Math.round(s)) < 0.01);
  return (
    <span className="whitespace-nowrap">
      {name} {scales.slice(0, 2).map((s) => `${s.toFixed(2)}×`).join(', ')}
      {scales.length > 2 ? ' …' : ''}{' '}
      <b className={sharp ? 'text-emerald-700' : 'text-rose-700'}>{sharp ? 'sharp' : 'soft'}</b>
    </span>
  );
}

export function FitModeSwitch() {
  const mode = useFitMode();
  const [scales, setScales] = useState({ league: [] as number[], card: [] as number[] });
  useEffect(() => {
    const measure = () => setScales({ league: spriteScales('[data-lg-league-root]'), card: spriteScales('[data-lg-card-root]') });
    measure();
    const timer = window.setInterval(measure, 500);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (e.metaKey || e.ctrlKey || e.altKey || target?.closest('input, textarea, [contenteditable="true"]')) return;
      const next = KEY_MODES[e.key];
      if (next) setFitMode(next);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return (
    <div
      data-testid="fit-mode-switch"
      className="fixed left-1/2 top-1.5 z-50 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-card px-2 py-1 text-xs text-foreground shadow-md"
    >
      <span className="whitespace-nowrap font-semibold">Sprite sizing</span>
      <div role="radiogroup" aria-label="Sprite sizing" className="flex gap-1">
        {OPTIONS.map((o, i) => (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={mode === o.mode}
            title={o.hint}
            onClick={() => setFitMode(o.mode)}
            className={cn(
              'cursor-pointer whitespace-nowrap rounded-md border px-2 py-0.5 font-medium',
              mode === o.mode ? 'border-foreground bg-foreground text-background' : 'bg-background hover:bg-muted',
            )}
          >
            {o.label} <span className="opacity-60">{i + 1}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-col leading-tight tabular-nums">
        <Readout name="Card" scales={scales.card} />
        <Readout name="League" scales={scales.league} />
      </div>
    </div>
  );
}
