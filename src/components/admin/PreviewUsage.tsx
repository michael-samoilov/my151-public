import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewChipZoomProvider } from '@/components/admin/FitNowrap';
import { PREVIEW_CHIP_MD, usePreviewChipZoom } from '@/components/admin/previewChipZoom';
import type { CardTime, ToolCell, UsageTool } from '@/components/admin/browserUsage';
import { PREVIEW_PROGRESS, sessionChipParts } from '@/components/admin/userPreview';

const HALF =
  'inline-flex shrink-0 flex-col items-center justify-center whitespace-nowrap px-1 py-0.5 text-xs leading-tight tabular-nums max-md:flex-1 md:rounded-xl md:border md:border-border md:bg-card md:px-1';

const COLUMN = 'row-start-1 flex min-w-0 flex-col items-stretch rounded-xl border border-border bg-card md:contents';

function Divider() {
  return <span aria-hidden className="mx-auto h-px w-4/5 shrink-0 bg-border md:hidden" />;
}

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

function TimeHalf({
  tool,
  sessions,
  totalMs,
  missing,
  partial,
  className,
}: {
  tool: UsageTool | 'total';
  sessions: number;
  totalMs: number;
  missing?: boolean;
  partial?: boolean;
  className?: string;
}) {
  const parts = sessionChipParts(sessions, totalMs);
  return (
    <span
      data-metric="session"
      data-tool={tool}
      title={missing ? 'Foreground attention has not been recorded for this history' : partial ? 'Partial foreground history: older intervals or another tool’s attention are missing' : tool === 'total' ? 'Browser total: sessions merged across tools, time counted once' : undefined}
      className={cn(HALF, className)}
    >
      {missing ? <><span className="font-bold text-foreground">—</span><span className="sr-only">{' · '}</span><span className="font-medium text-muted-foreground">not recorded</span></> : <>
      <span>
        <span className="font-bold text-foreground">{parts.count}</span>{' '}
        <span className="font-medium text-muted-foreground">{parts.unit}</span>
      </span>
      <span className="sr-only">{' · '}</span>
      <span className="font-medium text-muted-foreground">{parts.duration}{partial ? '*' : ''}</span>
      </>}
    </span>
  );
}

const DESKTOP_COL: Record<UsageTool | 'total', string> = {
  dex: 'md:col-start-7',
  league: 'md:col-start-8',
  picker: 'md:col-start-9',
  total: 'md:col-start-10',
};

function UsageGrid({ cells, total }: { cells: ToolCell[]; total: CardTime }) {
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
            sessions={c.sessions}
            totalMs={c.totalMs}
            missing={c.missing}
            partial={c.partial}
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
          missing={total.missing}
          partial={total.partial}
          className={cn('md:row-start-2 md:self-stretch md:justify-self-stretch md:border-foreground/25 md:bg-muted', DESKTOP_COL.total)}
        />
      </span>
    </>
  );
}

export function BrowserUsage({ cells, total }: { cells: ToolCell[]; total: CardTime }) {
  const zoom = usePreviewChipZoom();
  return (
    <div data-usage-host className="min-w-0 md:contents">
      <div className="grid w-full grid-cols-4 items-stretch gap-1 md:contents" style={{ zoom }}>
        <UsageGrid cells={cells} total={total} />
      </div>
    </div>
  );
}

const WORST_USAGE = { sessions: 999, totalMs: 999 * 3_600_000 + 59 * 60_000 };
const WORST: ToolCell[] = (['dex', 'league', 'picker'] as const).map((tool) => ({
  tool,
  used: true,
  count: 999,
  exported: true,
  ...WORST_USAGE,
}));

export function PreviewUsageScale({ children }: { children: ReactNode }) {
  const probeRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  useLayoutEffect(() => {
    const probe = probeRef.current;
    if (!probe) return;
    const mq = window.matchMedia(PREVIEW_CHIP_MD);
    const HOST = '[data-user-preview] [data-usage-host]';
    const measure = () => {
      const host = document.querySelector<HTMLElement>(HOST);
      const need = probe.scrollWidth;
      const avail = host?.clientWidth ?? 0;
      const next = mq.matches || need <= 0 || avail <= 0 ? 1 : Math.min(1, avail / (need + 2));
      setZoom((z) => (Math.abs(z - next) < 0.005 ? z : next));
    };
    measure();
    void document.fonts.ready.then(measure);
    const ro = new ResizeObserver(measure);
    ro.observe(probe);
    const host = document.querySelector<HTMLElement>(HOST);
    if (host) ro.observe(host);
    window.addEventListener('resize', measure);
    mq.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      mq.removeEventListener('change', measure);
    };
  });
  return (
    <>
      <div ref={probeRef} aria-hidden data-usage-probe className="pointer-events-none invisible fixed left-0 top-0 -z-10 grid w-max grid-cols-4 gap-1">
        <UsageGrid cells={WORST} total={WORST_USAGE} />
      </div>
      <div hidden data-preview-chip-zoom={zoom} />
      <PreviewChipZoomProvider zoom={zoom}>{children}</PreviewChipZoomProvider>
    </>
  );
}
