import { createContext, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import {
  FaDesktop, FaMobileScreenButton, FaTabletScreenButton,
  FaWindows, FaApple, FaAndroid, FaLinux, FaUbuntu,
  FaChrome, FaFirefoxBrowser, FaSafari, FaEdge, FaOpera, FaGlobe,
} from 'react-icons/fa6';
import * as Flags from 'country-flag-icons/string/3x2';

const SZ = 15;

/** Device family icon (FontAwesome brands via react-icons). */
export function DeviceIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('mobile') || v.includes('phone')) return <FaMobileScreenButton size={SZ} />;
  if (v.includes('tablet')) return <FaTabletScreenButton size={SZ} />;
  return <FaDesktop size={SZ} />;
}

/** OS icon — the platform's own logo. */
export function OsIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('mac') || v.includes('ios') || v.includes('ipad')) return <FaApple size={SZ} />;
  if (v.includes('win')) return <FaWindows size={SZ} />;
  if (v.includes('android')) return <FaAndroid size={SZ} />;
  if (v.includes('ubuntu')) return <FaUbuntu size={SZ} />;
  if (v.includes('linux')) return <FaLinux size={SZ} />;
  return <FaGlobe size={SZ} />;
}

/** Browser icon — the browser's own logo. */
export function BrowserIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('edge')) return <FaEdge size={SZ} />;
  if (v.includes('safari')) return <FaSafari size={SZ} />;
  if (v.includes('firefox')) return <FaFirefoxBrowser size={SZ} />;
  if (v.includes('opera')) return <FaOpera size={SZ} />;
  if (v.includes('chrome') || v.includes('chromium')) return <FaChrome size={SZ} />;
  return <FaGlobe size={SZ} />;
}

/** Real flag icon (inline SVG, no network) for an ISO 3166-1 alpha-2 code. */
export function FlagIcon({ country }: { country?: string }) {
  const code = (country ?? '').toUpperCase();
  const svg = (Flags as Record<string, string>)[code];
  if (!svg) return <FaGlobe size={SZ} />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={code}
      className="h-[12px] w-[16px] shrink-0 rounded-[2px] object-cover"
    />
  );
}

/** Coordinates the icon-chip tooltips so only one shows at a time and a press
 *  anywhere else (including another chip) dismisses it. */
const TooltipCtx = createContext<{ openId: string | null; setOpenId: (id: string | null) => void }>({
  openId: null,
  setOpenId: () => {},
});

export function TooltipScope({ children }: { children: ReactNode }) {
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || !t.closest('[data-tooltip-chip]')) setOpenId(null);
    };
    const onScroll = () => setOpenId(null);
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [openId]);
  return <TooltipCtx.Provider value={{ openId, setOpenId }}>{children}</TooltipCtx.Provider>;
}

export function useTooltipChip() {
  const id = useId();
  const { openId, setOpenId } = useContext(TooltipCtx);
  const open = openId === id;
  return {
    open,
    toggle: () => setOpenId(open ? null : id),
    onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') setOpenId(id);
    },
    onPointerLeave: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') setOpenId(null);
    },
  };
}

/**
 * A compact chip whose label is disclosed on press (mobile) and hover (desktop).
 * Presses are coordinated by TooltipScope: opening one closes any other, and a
 * press anywhere else fades it.
 */
export function InfoChip({
  children,
  label,
  fillMd,
}: {
  children: ReactNode;
  label: string;
  fillMd?: boolean;
}) {
  const { open, toggle, onPointerEnter, onPointerLeave } = useTooltipChip();
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const btn = btnRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const place = () => {
      const r = btn.getBoundingClientRect();
      tip.style.left = `${r.left + r.width / 2}px`;
      tip.style.top = `${r.bottom + 4}px`;
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open]);

  return (
    <span className={cn('relative inline-flex shrink-0', fillMd && 'md:w-full')} data-tooltip-chip>
      <button
        ref={btnRef}
        type="button"
        data-tooltip-chip
        className={cn(
          'flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2 text-muted-foreground outline-none hover:text-foreground focus:outline-none focus-visible:outline-none focus-visible:ring-0 [-webkit-tap-highlight-color:transparent]',
          fillMd && 'md:w-full md:justify-center',
        )}
        aria-label={label}
        onClick={toggle}
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {children}
      </button>
      {open &&
        createPortal(
          <span
            ref={tipRef}
            role="tooltip"
            data-tooltip-chip
            data-info-chip-tip
            className="fixed z-30 max-w-[min(70vw,240px)] -translate-x-1/2 whitespace-normal break-words rounded-md border border-border bg-card px-2 py-1 text-center text-[0.7rem] font-medium leading-snug text-foreground shadow-md"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  );
}
