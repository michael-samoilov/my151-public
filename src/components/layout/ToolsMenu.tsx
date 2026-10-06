import { useEffect, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';

/**
 * The global header's tool switcher. A dropdown rather than spelled-out
 * links, so the row survives more tools being added. Rendered by every
 * entry, so the links are real navigations, not view state.
 */

const TOOLS = [
  { id: 'dex', href: '/pokedex-builder', label: 'tools.dex' },
  { id: 'league', href: '/custom-gym-leader', label: 'tools.league' },
  { id: 'favorites', href: '/favorite-pokemon-picker', label: 'tools.favorites' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

/**
 * A one-time pointer at this menu: "the builder moved, it is under Tools",
 * "there is a new tool under Tools". A tooltip anchored to the button, not
 * a block in the page, so it points at the thing it talks about and takes
 * no room from the content. It stays open until the person opens the menu
 * or taps its close mark; `onDismiss` says which.
 */
export interface ToolsCallout {
  text: string;
  dismissLabel: string;
  testId: string;
  onDismiss: (reason: 'menu' | 'close') => void;
}

export function ToolsMenu({ current, callout }: { current?: ToolId; callout?: ToolsCallout | null }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on outside click — the SettingsMenu recipe.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // The callout hangs over the tool bar under it. The first tap anywhere
  // else ends it, so it never stands between a person and the page for
  // more than one gesture. A tap on the button itself is the menu path.
  const tipRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!callout) return;
    const handler = (e: PointerEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t) || tipRef.current?.contains(t)) return;
      callout.onDismiss('close');
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [callout]);

  const button = (
    <button
      type="button"
      onClick={() => {
        if (callout && !open) callout.onDismiss('menu');
        setOpen((o) => !o);
      }}
      aria-expanded={open}
      data-testid="tools-menu"
      className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
    >
      {t('tools.title')}
      <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
    </button>
  );

  return (
    <div ref={menuRef} className="relative">
      {callout ? (
        // Controlled and never closed by hover or focus: it is a notice, not
        // a hint, and it ends only when the person acts on it.
        <Tooltip open>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              ref={tipRef}
              side="bottom"
              align="end"
              data-testid={callout.testId}
              role="status"
              // Radix mirrors the content into a hidden copy for screen
              // readers; with a label it mirrors only the words, not the
              // close button.
              aria-label={callout.text}
              // The header, the page and the popover are all within a few
              // percent of white, so the original `border-0` notice merged
              // into the header's bottom edge and read as part of the page.
              // A brand-red outline separates it without inverting the
              // surface, which at this size read heavier than the message.
              //
              // A `ring` rather than a border: it draws outside the box
              // instead of inside it, so the outline costs the notice no
              // interior width at the phone size where it is tightest.
              //
              // The arrow is red too: filled with the popover colour it was
              // white on a white header, so the notice never visibly pointed
              // at the menu it talks about.
              className="z-[200] max-w-[min(18rem,calc(100vw-1.5rem))] border-0 pr-7 text-left shadow-xl ring-2 ring-primary"
            >
              <TooltipArrow className="fill-primary" />
              <div className="text-xs font-medium leading-snug">{callout.text}</div>
              <button
                type="button"
                aria-label={callout.dismissLabel}
                onClick={() => callout.onDismiss('close')}
                className="absolute right-1 top-1 rounded p-1 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X size={12} />
              </button>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ) : (
        button
      )}
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[170px] rounded-lg border bg-popover py-1 shadow-lg">
          {TOOLS.map((tool) => (
            <a
              key={tool.id}
              href={tool.href}
              className={cn(
                'flex w-full items-center whitespace-nowrap px-3 py-2 text-sm transition-colors hover:bg-muted',
                tool.id === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {t(tool.label)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
