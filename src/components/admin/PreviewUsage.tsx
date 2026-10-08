import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FitNowrap, PreviewChipZoomProvider } from '@/components/admin/FitNowrap';
import { PreviewChipZoomReport } from '@/components/admin/previewChipZoom';
import { browserTotal, type ToolCell, type UsageTool } from '@/components/admin/browserUsage';
import { PREVIEW_PROGRESS, sessionChipParts } from '@/components/admin/userPreview';

/** Two lines, so each tool's column stays narrow enough for four on a phone. */
const CHIP =
  'inline-flex shrink-0 flex-col items-center justify-center whitespace-nowrap rounded-xl border border-border bg-card px-1 py-0.5 text-xs leading-tight tabular-nums md:px-2';

/** Progress over the tool's noun: "12/151" over "Dex", and a camera once exported. */
function ProgressChip({ cell, className }: { cell: ToolCell; className?: string }) {
  const { of, noun } = PREVIEW_PROGRESS[cell.tool];
  const empty = cell.count === 0;
  return (
    <span
      data-metric={cell.tool}
      data-empty={empty ? 'true' : undefined}
      className={cn(CHIP, empty && 'opacity-40', className)}
    >
      <span className="font-bold text-foreground">{`${cell.count}/${of}`}</span>{' '}
      <span className="inline-flex items-center gap-0.5 font-medium text-muted-foreground">
        {noun}
        {cell.exported && !empty ? <Camera className="h-3 w-3 shrink-0" aria-label="exported" /> : null}
      </span>
    </span>
  );
}

/** Sessions over time, on two lines, so the chip fits under its progress chip. */
function TimeChip({
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
      className={cn(CHIP, tool === 'total' && 'border-foreground/25 bg-muted', className)}
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

const PHONE_COL = ['col-start-1', 'col-start-2', 'col-start-3', 'col-start-4'] as const;
const DESKTOP_COL: Record<UsageTool | 'total', string> = {
  dex: 'md:col-start-7',
  league: 'md:col-start-8',
  picker: 'md:col-start-9',
  total: 'md:col-start-10',
};

/**
 * A browser's usage: the progress chips in one row, each tool's sessions and
 * time under its chip, then the browser total. Phones lay it out as its own
 * grid; desktop places each chip in the list's table columns.
 */
function UsageGrid({ cells, total }: { cells: ToolCell[]; total: { sessions: number; totalMs: number } | null }) {
  const end = PHONE_COL[cells.length];
  return (
    <>
      {cells.map((c, i) => (
        <ProgressChip
          key={c.tool}
          cell={c}
          className={cn('row-start-1 self-stretch justify-self-stretch md:row-start-1', PHONE_COL[i], DESKTOP_COL[c.tool])}
        />
      ))}
      {cells.map((c, i) => (
        <TimeChip
          key={`${c.tool}-time`}
          tool={c.tool}
          sessions={c.usage.sessions}
          totalMs={c.usage.totalMs}
          className={cn('row-start-2 self-stretch justify-self-stretch md:row-start-2', PHONE_COL[i], DESKTOP_COL[c.tool])}
        />
      ))}
      {total && (
        <>
          <span
            aria-hidden
            className={cn(
              'row-start-1 self-end justify-self-center pb-0.5 text-[0.7rem] font-semibold leading-none text-muted-foreground md:row-start-1 md:self-center',
              end,
              DESKTOP_COL.total,
            )}
          >
            Total
          </span>
          <TimeChip
            tool="total"
            sessions={total.sessions}
            totalMs={total.totalMs}
            className={cn('row-start-2 self-stretch justify-self-stretch md:row-start-2', end, DESKTOP_COL.total)}
          />
        </>
      )}
    </>
  );
}

/** The usage block of one Newest browsers card. */
export function BrowserUsage({ cells }: { cells: ToolCell[] }) {
  const total = cells.length >= 2 ? browserTotal(cells.map((c) => c.usage)) : null;
  return (
    <div className="min-w-0 md:contents">
      <FitNowrap contentsOnMd lockZoom innerClassName="grid items-center">
        <UsageGrid cells={cells} total={total} />
      </FitNowrap>
    </div>
  );
}

/** Gives every card one chip size on a phone: the largest that fits the
 *  widest card in the list. A card reports its own fit (see FitNowrap). */
export function PreviewUsageScale({ children }: { children: ReactNode }) {
  const fits = useRef(new Map<string, number>());
  const [zoom, setZoom] = useState(1);
  const report = useCallback((id: string, fit: number | null) => {
    if (fit === null) fits.current.delete(id);
    else fits.current.set(id, fit);
    let min = 1;
    for (const f of fits.current.values()) min = Math.min(min, f);
    setZoom((z) => (Math.abs(z - min) < 0.005 ? z : min));
  }, []);
  return (
    <PreviewChipZoomReport.Provider value={report}>
      <div hidden data-preview-chip-zoom={zoom} />
      <PreviewChipZoomProvider zoom={zoom}>{children}</PreviewChipZoomProvider>
    </PreviewChipZoomReport.Provider>
  );
}
