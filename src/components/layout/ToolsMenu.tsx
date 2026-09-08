import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * The global header's tool switcher. A dropdown rather than spelled-out
 * links, so the row survives more tools being added. Rendered by both
 * entries, so the links are real navigations, not view state.
 */

const TOOLS = [
  { id: 'dex', href: '/', label: 'Pokédex Builder' },
  { id: 'league', href: '/pokemon-league-builder', label: 'League Builder' },
] as const;

export type ToolId = (typeof TOOLS)[number]['id'];

export function ToolsMenu({ current }: { current: ToolId }) {
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

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid="tools-menu"
        className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
      >
        Tools
        <ChevronDown size={14} className={cn('transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-1 min-w-[170px] rounded-lg border bg-popover py-1 shadow-lg">
          {TOOLS.map((t) => (
            <a
              key={t.id}
              href={t.href}
              className={cn(
                'flex w-full items-center px-3 py-2 text-sm transition-colors hover:bg-muted',
                t.id === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {t.label}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
