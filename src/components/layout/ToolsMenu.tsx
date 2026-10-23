import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FAVORITES_NOTICE_END, isReturningVisitor, isFavoritesNoticeWindow, isFavoritesNoticeSeen, markFavoritesNoticeSeen, markVisited } from '@/lib/launchFlags';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { GymIcon, PokedexIcon, RibbonIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';

const TOOLS = [
  { id: 'dex', href: '/pokedex-builder', label: 'tools.dex', Icon: PokedexIcon, scale: 1 },
  { id: 'league', href: '/custom-gym-leader', label: 'tools.league', Icon: GymIcon, scale: 1.08 },
  { id: 'favorites', href: '/favorite-pokemon-picker', label: 'tools.favorites', Icon: RibbonIcon, scale: 1.03 },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

export interface ToolsCallout {
  text: string;
  dismissLabel: string;
  testId: string;
  allowThrough?: boolean;
  onDismiss: (reason: 'menu' | 'close') => void;
}

export function ToolsMenu({ current, callout: pageCallout }: { current?: ToolId; callout?: ToolsCallout | null }) {
  const t = useT();
  const [launchNotice, setLaunchNotice] = useState(() =>
    isReturningVisitor && isFavoritesNoticeWindow() && !isFavoritesNoticeSeen());
  useEffect(() => { markVisited(); }, []);
  useEffect(() => {
    if (!launchNotice) return;
    const timer = window.setTimeout(() => setLaunchNotice(false), FAVORITES_NOTICE_END - Date.now());
    return () => window.clearTimeout(timer);
  }, [launchNotice]);
  const callout = useMemo<ToolsCallout | null | undefined>(() => launchNotice
    ? {
        text: t('home.favorites.tip'),
        dismissLabel: t('home.favorites.dismiss'),
        testId: 'favorites-launch-notice',
        allowThrough: true,
        onDismiss: () => { markFavoritesNoticeSeen(); setLaunchNotice(false); },
      }
    : isFavoritesNoticeWindow() ? null : pageCallout, [launchNotice, pageCallout, t]);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

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
        <Tooltip open>
          <TooltipTrigger asChild>{button}</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent
              ref={tipRef}
              side="bottom"
              align="end"
              data-testid={callout.testId}
              data-callout-click-through={callout.allowThrough || undefined}
              role="status"
              // Radix mirrors the content into a hidden copy for screen
              // readers; with a label it mirrors only the words, not the
              // close button.
              aria-label={callout.text}
              className={cn('z-[200] max-w-[min(18rem,calc(100vw-1.5rem))] border-0 pr-7 text-left shadow-xl ring-2 ring-primary', callout.allowThrough && 'pointer-events-none')}
            >
              <TooltipArrow className="fill-primary" />
              <div className="text-xs font-medium leading-snug">{callout.text}</div>
              <button
                type="button"
                aria-label={callout.dismissLabel}
                onClick={() => callout.onDismiss('close')}
                className="pointer-events-auto absolute right-1 top-1 rounded p-1 opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X size={12} />
              </button>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      ) : (
        button
      )}
      <div hidden={!open} className="absolute right-0 top-full z-[120] mt-1 min-w-[170px] rounded-lg border bg-popover py-1 shadow-lg">
          {TOOLS.map((tool) => (
            <a
              key={tool.id}
              href={tool.href}
              className={cn(
                'flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-sm transition-colors hover:bg-muted',
                tool.id === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              <tool.Icon className="w-4 h-4 shrink-0" {...pathScale(tool.scale)} />
              {t(tool.label)}
            </a>
          ))}
      </div>
    </div>
  );
}
