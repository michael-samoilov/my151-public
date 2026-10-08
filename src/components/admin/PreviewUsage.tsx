import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewChipZoomProvider } from '@/components/admin/FitNowrap';
import { PREVIEW_CHIP_MD, usePreviewChipZoom } from '@/components/admin/previewChipZoom';
import { browserTotal, type ToolCell, type UsageTool } from '@/components/admin/browserUsage';
import { PREVIEW_PROGRESS, sessionChipParts } from '@/components/admin/userPreview';

/** One half of a column: two lines of text. On a phone the column's merged
 *  chip draws the border; on desktop each half is its own chip. */
const HALF =
  'inline-flex shrink-0 flex-col items-center justify-center whitespace-nowrap px-1 py-0.5 text-xs leading-tight tabular-nums max-md:flex-1 md:rounded-xl md:border md:border-border md:bg-card md:px-2';

/** On a phone, one chip per column: progress on top, sessions and time below,
 *  split by a short rule. On desktop the column dissolves into the table. */
const COLUMN = 'row-start-1 flex min-w-0 flex-col items-stretch rounded-xl border border-border bg-card md:contents';

/** A short rule between the halves of a phone chip, inset from both edges. */
function Divider() {
  return <span aria-hidden className="mx-auto h-px w-4/5 shrink-0 bg-border md:hidden" />;
}

/** Progress over the tool's noun: "12/151" over "Dex". The count, not the
 *  total, is red once it reaches the total; a red camera follows an exported tool. */
function ProgressHalf({ cell, className }: { cell: ToolCell; className?: string }) {
  const { of, noun } = PREVIEW_PROGRESS[cell.tool];
  return (
    <span data-metric={cell.tool} data-empty={cell.used ? undefined : 'true'} className={cn(HALF, className)}>
      <span className="font-bold text-foreground">
        <span className={cn(cell.count >= of && 'text-red-600')}>{cell.count}</span>/{of}
      </span>{' '}
      <span className="inline-flex items-center gap-0.5 font-medium text-muted-foreground">
        {noun}
        {cell.exported ? <Camera className="h-3 w-3 shrink-0 text-red-600" aria-label="exported" /> : null}
      </span>
    </span>
  );
}

/** Sessions over time, on two lines. */
function TimeHalf({
  tool,
  sessions,
  totalMs,
  className,
}: {
  tool: UsageTool | 'total';
  sessions: number;
  totalMs: number;
  className?: string;
}) {
  const parts = sessionChipParts(sessions, totalMs);
  return (
    <span
      data-metric="session"
      data-tool={tool}
      title={tool === 'total' ? 'Browser total: sessions merged across tools, time counted once' : undefined}
      className={cn(HALF, className)}
    >
      <span>
        <span className="font-bold text-foreground">{parts.count}</span>{' '}
        <span className="font-medium text-muted-foreground">{parts.unit}</span>
      </span>
      <span className="sr-only">{' · '}</span>
      <span className="font-medium text-muted-foreground">{parts.duration}</span>
    </span>
  );
}

const DESKTOP_COL: Record<UsageTool | 'total', string> = {
  dex: 'md:col-start-7',
  league: 'md:col-start-8',
  picker: 'md:col-start-9',
  total: 'md:col-start-10',
};

/**
 * A browser's usage. Phones show four equal columns across the card, one
 * merged chip each: Dex, Gyms, Favs, then the browser total. Desktop places
 * each half in the list's table columns, progress above sessions and time.
 */
function UsageGrid({ cells, total }: { cells: ToolCell[]; total: { sessions: number; totalMs: number } }) {
  return (
    <>
      {cells.map((c) => (
        <span key={c.tool} className={cn(COLUMN, !c.used && 'max-md:opacity-40')}>
          <ProgressHalf
            cell={c}
            className={cn('md:row-start-1 md:self-stretch md:justify-self-stretch', DESKTOP_COL[c.tool], !c.used && 'md:opacity-40')}
          />
          <Divider />
          <TimeHalf
            tool={c.tool}
            sessions={c.usage.sessions}
            totalMs={c.usage.totalMs}
            className={cn('md:row-start-2 md:self-stretch md:justify-self-stretch', DESKTOP_COL[c.tool], !c.used && 'md:opacity-40')}
          />
        </span>
      ))}
      <span className={cn(COLUMN, 'border-foreground/25 bg-muted')}>
        <span
          className={cn(
            'flex items-center justify-center px-1 py-0.5 text-xs font-semibold leading-tight text-muted-foreground max-md:flex-1 md:row-start-1 md:self-center md:justify-self-center md:text-[0.7rem]',
            DESKTOP_COL.total,
          )}
        >
          Total
        </span>
        <Divider />
        <TimeHalf
          tool="total"
          sessions={total.sessions}
          totalMs={total.totalMs}
          className={cn('md:row-start-2 md:self-stretch md:justify-self-stretch md:border-foreground/25 md:bg-muted', DESKTOP_COL.total)}
        />
      </span>
    </>
  );
}

/** The usage block of one Newest browsers card. On a phone its four columns
 *  always split the card width equally, and the list-wide zoom sizes the text. */
export function BrowserUsage({ cells }: { cells: ToolCell[] }) {
  const total = browserTotal(cells.filter((c) => c.used).map((c) => c.usage));
  const zoom = usePreviewChipZoom();
  return (
    <div data-usage-host className="min-w-0 md:contents">
      <div className="grid w-full grid-cols-4 items-stretch gap-1 md:contents" style={{ zoom }}>
        <UsageGrid cells={cells} total={total} />
      </div>
    </div>
  );
}

const WORST_USAGE = { sessions: 999, totalMs: 999 * 3_600_000 + 59 * 60_000, spans: [] };
/** The widest card the list can hold: triple digits in every column. */
const WORST: ToolCell[] = (['dex', 'league', 'picker'] as const).map((tool) => ({
  tool,
  used: true,
  count: 999,
  exported: true,
  usage: WORST_USAGE,
}));

/**
 * Gives every card one text size on a phone, whatever its numbers: the
 * largest that fits a hidden worst-case card (`WORST`) into a card's width.
 * Each card's columns fill its width, so no card is wider than another.
 */
export function PreviewUsageScale({ children }: { children: ReactNode }) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const mq = window.matchMedia(PREVIEW_CHIP_MD);
    const measure = () => {
      const host = document.querySelector<HTMLElement>('[data-usage-host]');
      const need = probe.scrollWidth;
      const avail = host?.clientWidth ?? 0;
      // Two spare pixels absorb scrollWidth rounding.
      const next = mq.matches || need <= 0 || avail <= 0 ? 1 : Math.min(1, avail / (need + 2));
      setZoom((z) => (Math.abs(z - next) < 0.005 ? z : next));
    };
    measure();
    void document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    const host = document.querySelector<HTMLElement>('[data-usage-host]');
    if (host) ro.observe(host);
    mq.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      mq.removeEventListener('change', measure);
    };
  });
  return (
    <>
      <div ref={probeRef} aria-hidden className="pointer-events-none invisible fixed left-0 top-0 -z-10 grid w-max grid-cols-4 gap-1">
        <UsageGrid cells={WORST} total={WORST_USAGE} />
      </div>
      <div hidden data-preview-chip-zoom={zoom} />
      <PreviewChipZoomProvider zoom={zoom}>{children}</PreviewChipZoomProvider>
    </>
  );
}
