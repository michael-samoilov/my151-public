import { useEffect, useRef, useState } from 'react';
import { Settings, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLeagueStore } from '../store/useLeagueStore';

/**
 * The gym card's own gear: one destructive option, behind a confirm.
 *
 * The dex builder's build page already answers "start this over" (its
 * `SettingsMenu` in `PokedexGrid.tsx`), and this is that control: the same
 * gear, the same anchored menu, the same two-step where the first press turns
 * the row into "Are you sure?" and a second press does the work. The confirm
 * lapses after three seconds and on a press outside, so a menu left open
 * never sits armed.
 *
 * It is the card's settings and not the league's, so it lives beside the
 * card's own type and theme rather than in the league tool bar.
 */
const CONFIRM_MS = 3000;

export function CardSettingsMenu({ cardIndex }: { cardIndex: number }) {
  const clearCard = useLeagueStore((s) => s.clearCard);
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  const onClear = () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    clearCard(cardIndex);
    setOpen(false);
    setConfirming(false);
  };

  return (
    <div ref={menuRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Card settings"
        data-testid="card-settings"
        onClick={() => {
          setOpen((o) => !o);
          setConfirming(false);
        }}
        className="flex cursor-pointer items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings size={16} aria-hidden />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-[120] mt-1 min-w-[10rem] rounded-lg border bg-popover py-1 shadow-lg"
        >
          <button
            type="button"
            role="menuitem"
            data-testid="card-clear"
            data-confirming={confirming ? 'true' : 'false'}
            onClick={onClear}
            className={cn(
              'flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors',
              confirming
                ? 'bg-destructive/10 font-medium text-destructive'
                : 'text-destructive/80 hover:bg-muted',
            )}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            {confirming ? 'Are you sure?' : 'Clear Card'}
          </button>
        </div>
      )}
    </div>
  );
}
