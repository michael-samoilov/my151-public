import { useEffect, useRef, useState } from 'react';
import { Settings, Trash2, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { cn } from '@/lib/utils';
import { useLeagueStore, type LeagueView } from '../store/useLeagueStore';

/**
 * League settings: the gear in the tool bar, and what it opens.
 *
 * The dex builder's view settings are a docked pane beside the grid. The
 * league already spends its desktop width on three panes, so the same content
 * arrives as an anchored dropdown there and as the same bottom sheet on
 * mobile — the option rows, the radio dot and the description under each are
 * the dex builder's, so the two tools read as one app.
 */

const VIEWS: { value: LeagueView; label: string; description: string }[] = [
  {
    value: 'challenge',
    label: 'Gym Challenge',
    description: 'Each trainer shows the team you meet them with, so the league grows from two Pokémon to six.',
  },
  {
    value: 'rematch',
    label: 'Endgame Rematches',
    description: 'Every trainer shows their endgame boss team, at full size, legendary and all.',
  },
];

function ViewOption({ option, selected, onPick }: {
  option: (typeof VIEWS)[number];
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={selected}
      data-league-view={option.value}
      onClick={onPick}
      className={cn(
        'w-full cursor-pointer rounded-md px-3 py-2 text-left transition-colors',
        selected ? 'bg-primary/10' : 'hover:bg-muted',
      )}
    >
      <span className="flex items-center gap-2">
        <span
          className={cn(
            'flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2',
            selected ? 'border-primary' : 'border-muted-foreground/40',
          )}
        >
          {selected && <span className="h-2 w-2 rounded-full bg-primary" />}
        </span>
        <span className={cn('text-sm', selected ? 'font-medium text-primary' : 'text-foreground')}>
          {option.label}
        </span>
      </span>
      <span className="ml-6 mt-1 block text-xs leading-snug text-muted-foreground">
        {option.description}
      </span>
    </button>
  );
}

export function LeagueSettingsPane({ onClose, embedded = false }: {
  onClose: () => void;
  /** In a sheet the sheet owns the title bar, so the pane drops its own. */
  embedded?: boolean;
}) {
  const view = useLeagueStore((s) => s.view);
  const setView = useLeagueStore((s) => s.setView);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div data-league-settings className="flex w-full flex-col">
      {!embedded && (
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold">League Settings</span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="px-3 pb-3 pt-3">
        <h3 className="mb-2 text-[0.625rem] font-semibold uppercase tracking-wide text-muted-foreground">
          League summary shows
        </h3>
        <div className="space-y-1">
          {VIEWS.map((option) => (
            <ViewOption
              key={option.value}
              option={option}
              selected={view === option.value}
              onPick={() => setView(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/** The gear itself, with its dropdown or sheet attached. */
export function LeagueSettingsButton({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDesktop = useIsDesktop();
  return (
    <span className="relative flex items-center">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="League settings"
        data-testid="league-settings"
        onClick={() => onOpenChange(!open)}
        className="flex cursor-pointer items-center rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        <Settings size={16} aria-hidden />
      </button>
      {open && isDesktop && (
        <>
          {/* A click anywhere else closes it, without the dropdown having to
              know what "anywhere else" contains. */}
          <span
            aria-hidden
            className="fixed inset-0 z-[110]"
            onClick={() => onOpenChange(false)}
          />
          <div className="absolute right-0 top-full z-[120] mt-1 w-[20rem] rounded-lg border bg-popover shadow-lg">
            <LeagueSettingsPane onClose={() => onOpenChange(false)} />
          </div>
        </>
      )}
      {open && !isDesktop && (
        <BottomSheet onClose={() => onOpenChange(false)} closeLabel="Close settings" title="League Settings">
          <LeagueSettingsPane onClose={() => onOpenChange(false)} embedded />
        </BottomSheet>
      )}
    </span>
  );
}

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
