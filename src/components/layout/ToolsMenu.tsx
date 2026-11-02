import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { useT } from '@/i18n';
import { cn } from '@/lib/utils';
import { FAVORITES_NOTICE_END, isReturningVisitor, isFavoritesNoticeWindow, isFavoritesNoticeSeen, markFavoritesNoticeSeen, markVisited } from '@/lib/launchFlags';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipPortal, TooltipArrow } from '@/components/ui/tooltip';
import { GymIcon, PokedexIcon, RibbonIcon } from '@/components/shared/AppIcons';
import { pathScale } from '@/lib/pathScale';
import { FAVORITES_TOTAL, useSavedToolProgress } from '@/lib/savedToolProgress';

const TOOLS = [
  { id: 'dex', href: '/pokedex-builder', label: 'tools.dex', Icon: PokedexIcon, scale: 1 },
  { id: 'league', href: '/custom-gym-leader', label: 'tools.league', Icon: GymIcon, scale: 1.08 },
  { id: 'favorites', href: '/favorite-pokemon-picker', label: 'tools.favorites', Icon: RibbonIcon, scale: 1.03 },
] as const;

type ToolId = (typeof TOOLS)[number]['id'];

type MenuState = 'closed' | 'hover' | 'pinned';

const MOUSE_REST_OPEN_DELAY_MS = 100;
const CLOSE_DELAY = 100;
const AIM_GRACE = 400;

type Point = { x: number; y: number };

const inRect = (p: Point, r: DOMRect) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;

function aimsAtPanel(p: Point, apex: Point, panel: DOMRect) {
  const b = { x: panel.left, y: panel.top };
  const c = { x: panel.right, y: panel.top };
  const side = (u: Point, v: Point) => (p.x - v.x) * (u.y - v.y) - (u.x - v.x) * (p.y - v.y);
  const d = [side(apex, b), side(b, c), side(c, apex)];
  return !(d.some((x) => x < 0) && d.some((x) => x > 0));
}

function ToolCount({ count, total }: { count: number | null; total: number }) {
  return (
    <span className="ml-auto grid shrink-0 whitespace-nowrap pl-3 text-right tabular-nums">
      <span aria-hidden className="invisible [grid-area:1/1]">{total}/{total}</span>
      {count !== null && (
        <span className="[grid-area:1/1]">
          <span className="font-bold text-primary">{count}</span>/{total}
        </span>
      )}
    </span>
  );
}

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
  const [menu, setMenu] = useState<MenuState>('closed');
  const open = menu !== 'closed';
  const progress = useSavedToolProgress(open);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openTimer = useRef(0);
  const lastPoint = useRef<Point | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu('closed');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  useEffect(() => {
    if (menu !== 'hover') return;
    let apex = lastPoint.current;
    let leaving = 0;
    let resting = 0;
    const close = () => setMenu('closed');
    const stay = () => { window.clearTimeout(leaving); window.clearTimeout(resting); leaving = 0; };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || !buttonRef.current || !panelRef.current) return;
      const p = { x: e.clientX, y: e.clientY };
      const panel = panelRef.current.getBoundingClientRect();
      if (inRect(p, buttonRef.current.getBoundingClientRect())) { apex = p; stay(); return; }
      if (inRect(p, panel)) { apex = null; stay(); return; }
      if (apex && aimsAtPanel(p, apex, panel)) {
        stay();
        resting = window.setTimeout(close, AIM_GRACE);
        return;
      }
      window.clearTimeout(resting);
      if (!leaving) leaving = window.setTimeout(close, CLOSE_DELAY);
    };
    const onOut = (e: MouseEvent) => { if (!e.relatedTarget) close(); };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('mouseout', onOut);
    return () => {
      stay();
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseout', onOut);
    };
  }, [menu]);

  useEffect(() => () => window.clearTimeout(openTimer.current), []);

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
      ref={buttonRef}
      type="button"
      onPointerMove={(e) => {
        lastPoint.current = { x: e.clientX, y: e.clientY };
        window.clearTimeout(openTimer.current);
        if (e.pointerType !== 'mouse' || open || callout) return;
        if (menuRef.current?.parentElement?.querySelector('[aria-expanded="true"]')) return;
        openTimer.current = window.setTimeout(() => setMenu('hover'), MOUSE_REST_OPEN_DELAY_MS);
      }}
      onPointerLeave={() => window.clearTimeout(openTimer.current)}
      onClick={() => {
        window.clearTimeout(openTimer.current);
        if (callout && !open) callout.onDismiss('menu');
        setMenu((m) => (m === 'pinned' ? 'closed' : 'pinned'));
      }}
      aria-expanded={open}
      data-testid="tools-menu"
      className="relative before:absolute before:inset-x-0 before:-inset-y-1.5 before:content-[''] flex cursor-pointer items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
              // platform: Radix mirrors popover content into a hidden copy for screen readers; an aria-label limits the copy to the words.
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
      <div ref={panelRef} hidden={!open} className="absolute right-0 top-full z-[120] mt-1 w-max min-w-[170px] max-w-[calc(100vw-1.5rem)] rounded-lg border bg-popover py-1 shadow-lg">
          {TOOLS.map((tool) => {
            const saved = progress[tool.id];
            return (
              <a
                key={tool.id}
                href={tool.href}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors hover:bg-muted',
                  tool.id === current ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                <tool.Icon className="w-4 h-4 shrink-0" {...pathScale(tool.scale)} />
                <span className="min-w-0">{t(tool.label)}</span>
                <ToolCount count={saved?.count ?? null} total={saved?.total ?? FAVORITES_TOTAL} />
              </a>
            );
          })}
      </div>
    </div>
  );
}
