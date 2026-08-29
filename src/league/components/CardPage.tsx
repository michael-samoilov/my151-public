import { ChevronLeft, X } from 'lucide-react';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { cn } from '@/lib/utils';
import { slotLabel } from '../model/constants';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { useCardView } from '../useCardView';
import { CardGrid } from './CardGrid';
import { MovePicker } from './MovePicker';

/**
 * One open gym card: its identity row (type badge, theme), the 11-row grid,
 * and the pickers it launches. `showBack` is the mobile full-screen mode;
 * the desktop pane renders the same component without it.
 */

function TypePicker({ cardIndex }: { cardIndex: number }) {
  const setCardType = useLeagueStore((s) => s.setCardType);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const pick = (t: TypeName | null) => {
    setCardType(cardIndex, t);
    setTypePickerOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setTypePickerOpen(false)} />
      <div className="relative rounded-t-2xl bg-background p-4 shadow-2xl md:w-[24rem] md:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Gym type</span>
          <button
            type="button"
            onClick={() => setTypePickerOpen(false)}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TYPE_NAMES.map((t) => (
            <button key={t} type="button" onClick={() => pick(t)} className="cursor-pointer transition-transform hover:scale-105">
              <TypeBadge type={t} className="w-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick(null)}
            className="cursor-pointer rounded-full border border-dashed border-border py-0.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
          >
            No type
          </button>
        </div>
      </div>
    </div>
  );
}

export function CardPage({ cardIndex, showBack }: { cardIndex: number; showBack: boolean }) {
  const view = useCardView(cardIndex);
  const setCardTheme = useLeagueStore((s) => s.setCardTheme);
  const closeCardPage = useLeagueUi((s) => s.closeCardPage);
  const typePickerOpen = useLeagueUi((s) => s.typePickerOpen);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const movePickerOpen = useLeagueUi((s) => s.movePickerOpen);

  return (
    <div className="w-full">
      <div className={cn('flex items-center gap-2 px-3 py-[0.4375rem]', showBack && 'border-b bg-card')}>
        {showBack && (
          <button
            type="button"
            onClick={closeCardPage}
            aria-label={`Back to the league (${slotLabel(cardIndex)})`}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setTypePickerOpen(true)}
          aria-label="Gym type"
          className="cursor-pointer transition-transform hover:scale-105"
        >
          {view.card.type ? (
            <TypeBadge type={view.card.type} className="w-[4.75rem]" />
          ) : (
            <span className="inline-flex rounded-full border border-dashed border-border px-3 py-0.5 text-xs font-semibold text-muted-foreground">
              No type
            </span>
          )}
        </button>
        <input
          value={view.card.theme}
          onChange={(e) => setCardTheme(cardIndex, e.target.value)}
          placeholder="What is this gym's theme?"
          aria-label="Gym theme"
          className="min-w-0 flex-1 bg-transparent text-[0.6875rem] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
        />
        <span className="shrink-0 text-[0.6875rem] font-medium text-muted-foreground">{slotLabel(cardIndex)}</span>
      </div>
      <div className="px-3 pt-2.5">
        <CardGrid cardIndex={cardIndex} view={view} />
      </div>
      {typePickerOpen && <TypePicker cardIndex={cardIndex} />}
      {movePickerOpen && <MovePicker cardIndex={cardIndex} />}
    </div>
  );
}
