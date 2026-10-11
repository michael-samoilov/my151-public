import { cn } from '@/lib/utils';

/**
 * The app's one loading mark: the favicon's Poké Ball, turning. `tone="line"`
 * draws it in the text colour for buttons and chips, where the red half would
 * vanish into a red button. `delayed` keeps it hidden for the first 400 ms, so
 * a wait that ends sooner shows nothing at all.
 */
export function PokeBallSpinner({ className, tone = 'color', delayed = false }: {
  className?: string;
  tone?: 'color' | 'line';
  delayed?: boolean;
}) {
  const classes = cn('shrink-0 animate-spin', delayed && 'load-delay', className);
  if (tone === 'line') {
    return (
      <svg viewBox="0 0 24 24" className={classes} aria-hidden fill="none" stroke="currentColor"
        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M2 12h7" />
        <path d="M15 12h7" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 32 32" className={classes} aria-hidden>
      <circle cx="16" cy="16" r="15" fill="#fafafa" stroke="#dc2626" strokeWidth="1.5" />
      <path d="M2 16 A14 14 0 0 1 30 16" fill="#dc2626" />
      <line x1="2" y1="16" x2="30" y2="16" stroke="#fafafa" strokeWidth="2" />
      <circle cx="16" cy="16" r="4.5" fill="#fafafa" stroke="#dc2626" strokeWidth="2" />
    </svg>
  );
}

/**
 * A Poké Ball on a small card in the middle of the screen, for a sheet or
 * pane whose code is still downloading. The card keeps it from reading as a
 * stray mark on top of the page.
 */
export function ScreenSpinner() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[400] flex items-center justify-center">
      <div className="load-delay flex h-16 w-16 items-center justify-center rounded-2xl bg-card shadow-lg ring-1 ring-black/5">
        <PokeBallSpinner className="h-9 w-9" />
      </div>
    </div>
  );
}
