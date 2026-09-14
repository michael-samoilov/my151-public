import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { pressedOutside } from '@/lib/outsidePress';
import { cn } from '@/lib/utils';

export type FilterOption<K extends string = string> = {
  key: K;
  label: string;
  chipLabel?: string;
  icon?: ReactNode;
};

/**
 * One visible chip that opens the rest of a filter's options.
 *
 * Mobile uses a bottom sheet of wrapping chips (same shape as the language
 * picker and the builder filters). Desktop uses an anchored chip dropdown.
 */
export function PreviewFilterMenu<K extends string>({
  name,
  value,
  options,
  onChange,
  anyKey,
  clearable,
  ariaLabel,
  className,
  leadIcon,
  compactMd,
}: {
  name: string;
  value: K;
  options: FilterOption<K>[];
  onChange: (key: K) => void;
  anyKey?: K;
  clearable?: boolean;
  ariaLabel?: string;
  className?: string;
  leadIcon?: ReactNode;
  compactMd?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.key === value);
  const isAny = anyKey !== undefined && value === anyKey;
  const chipLabel = isAny || !current ? name : (current.chipLabel ?? current.label);
  const canClear = Boolean(clearable && !isAny && anyKey !== undefined);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (pressedOutside(rootRef.current, e.target)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (key: K) => {
    onChange(key);
    setOpen(false);
  };

  const menu = (
    <div role="listbox" aria-label={ariaLabel ?? name} className="flex flex-wrap gap-1.5 p-2">
      {options.map((o) => {
        const selected = o.key === value;
        return (
          <button
            key={o.key || 'unknown'}
            type="button"
            role="option"
            aria-selected={selected}
            onClick={() => pick(o.key)}
            className={cn(
              'inline-flex min-h-9 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors',
              selected
                ? 'border-foreground bg-foreground text-card'
                : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground',
            )}
          >
            {o.icon}
            {selected && <Check className="h-3 w-3" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <span className="inline-flex items-center">
        <button
          type="button"
          data-preview-filter={name}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel ?? name}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'inline-flex h-7 max-w-full items-center gap-1 rounded-full border px-2 text-xs font-semibold whitespace-nowrap transition-colors',
            compactMd && 'md:px-1.5',
            isAny
              ? 'border-border text-muted-foreground hover:text-foreground'
              : 'border-foreground bg-foreground text-card',
            canClear && 'rounded-r-none border-r-0 pr-1.5',
          )}
        >
          {!isAny && current?.icon ? <span className="inline-flex">{current.icon}</span> : null}
          {isAny && leadIcon ? (
            <span className={cn(compactMd ? 'hidden md:inline-flex' : 'inline-flex')}>{leadIcon}</span>
          ) : null}
          <span className={cn('truncate', isAny && compactMd && 'md:hidden')}>{chipLabel}</span>
          <ChevronDown className={cn('h-3 w-3 shrink-0 transition-transform', open && 'rotate-180')} />
        </button>
        {canClear && (
          <button
            type="button"
            aria-label={`Clear ${name}`}
            onClick={() => anyKey !== undefined && pick(anyKey)}
            className="inline-flex h-7 items-center rounded-r-full border border-l-0 border-foreground bg-foreground px-1.5 text-card hover:opacity-80"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </span>

      {open && (
        <div className="absolute left-0 top-full z-40 mt-1 hidden max-h-80 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-border bg-popover shadow-lg md:block">
          {menu}
        </div>
      )}

      {open && (
        <div className="md:hidden">
          <BottomSheet onClose={() => setOpen(false)} closeLabel={name} title={name}>
            <div className="pb-2">{menu}</div>
          </BottomSheet>
        </div>
      )}
    </div>
  );
}
