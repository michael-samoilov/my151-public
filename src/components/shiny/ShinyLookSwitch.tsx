import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { SHINY_LOOKS, type ShinyLookId } from './shinyMarks';
import { chooseShinyLook, useShinyLookId } from './useShinyLook';

/**
 * Switches between the shiny looks under review, in preview builds only. It is debug UI that never
 * ships to production, so its strings are English only and stay out of the translation catalogs.
 * It sits over the logo, the one corner that covers no control on a phone or a desktop.
 */
export function ShinyLookSwitch() {
  const chosen = useShinyLookId();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={root} data-testid="shiny-look-switch" data-picker-keep-open className="fixed top-2 left-2 z-[300] text-xs">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-dashed border-amber-500 bg-amber-50 px-2.5 font-semibold text-amber-800 shadow-sm"
      >
        Shiny look
        <ChevronDown className={open ? 'size-3.5 rotate-180' : 'size-3.5'} aria-hidden />
      </button>
      {open ? (
        <div role="group" aria-label="Shiny look" className="mt-1 flex w-max flex-col rounded-lg border bg-background p-1 shadow-lg">
          {(Object.keys(SHINY_LOOKS) as ShinyLookId[]).map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={id === chosen}
              data-shiny-look={id}
              onClick={() => {
                chooseShinyLook(id);
                setOpen(false);
              }}
              className="flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-3 pl-2 text-left text-foreground hover:bg-secondary"
            >
              <Check className={id === chosen ? 'size-3.5' : 'invisible size-3.5'} aria-hidden />
              {SHINY_LOOKS[id].label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
