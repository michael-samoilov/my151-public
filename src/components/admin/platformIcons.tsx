import { useState, type ReactNode } from 'react';
import {
  Monitor, Smartphone, Tablet, Apple, Bot, Terminal, LayoutGrid, Cpu,
  CircleDot, Compass, Flame, Globe,
} from 'lucide-react';
import * as Flags from 'country-flag-icons/string/3x2';
import { regionOf } from '@/lib/countryRegions';

const ICON = 'h-[15px] w-[15px]';

/** Device family icon. */
export function DeviceIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('mobile') || v.includes('phone')) return <Smartphone className={ICON} />;
  if (v.includes('tablet')) return <Tablet className={ICON} />;
  return <Monitor className={ICON} />;
}

/** OS icon. Brand-free glyphs from the shared lucide set, disambiguated by the
 *  chip's press/hover tooltip. */
export function OsIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('mac') || v.includes('ios') || v.includes('ipad')) return <Apple className={ICON} />;
  if (v.includes('win')) return <LayoutGrid className={ICON} />;
  if (v.includes('android')) return <Bot className={ICON} />;
  if (v.includes('linux')) return <Terminal className={ICON} />;
  return <Cpu className={ICON} />;
}

/** Browser icon, from the shared lucide set. */
export function BrowserIcon({ value }: { value?: string }) {
  const v = (value ?? '').toLowerCase();
  if (v.includes('safari')) return <Compass className={ICON} />;
  if (v.includes('firefox')) return <Flame className={ICON} />;
  if (v.includes('chrome')) return <CircleDot className={ICON} />;
  return <Globe className={ICON} />;
}

/** Real flag icon (inline SVG, no network) for an ISO 3166-1 alpha-2 code. */
export function FlagIcon({ country }: { country?: string }) {
  const code = (country ?? '').toUpperCase();
  const svg = (Flags as Record<string, string>)[code];
  if (!svg) return <Globe className={ICON} />;
  return (
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={code}
      className="h-[12px] w-[16px] rounded-[2px] object-cover"
    />
  );
}

export { regionOf };

/**
 * A compact chip whose label is disclosed on press (mobile) and on hover
 * (desktop). The button toggles the popover so a tap works without a hover,
 * and pointer enter/leave drives it on desktop.
 */
export function InfoChip({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex">
      <button
        type="button"
        className="flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2 text-muted-foreground hover:text-foreground"
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        onPointerEnter={() => setOpen(true)}
        onPointerLeave={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <span className="absolute left-1/2 top-full z-30 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-card px-2 py-1 text-[0.7rem] font-medium text-foreground shadow-md">
          {label}
        </span>
      )}
    </span>
  );
}
