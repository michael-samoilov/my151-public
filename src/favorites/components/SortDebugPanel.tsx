import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown, Check, Copy, X } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { saveSortOrder } from '../model/sortDebug';
import {
  DEX_KEY,
  formatSortOrder,
  sameSortOrder,
  SORT_KEYS,
  SORT_PRESETS,
  sortKey,
  type SortKeyId,
  type SortOrder,
} from '../model/sortKeys';

export function SortDebugPanel({
  desktop,
  order,
  onChange,
}: {
  desktop: boolean;
  order: SortOrder;
  onChange: (order: SortOrder) => void;
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => saveSortOrder(order), [order]);

  useEffect(() => {
    if (!open || !desktop) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, desktop]);

  const button = (
    <button
      type="button"
      data-testid="favorites-sort-debug-open"
      data-picker-keep-open
      aria-expanded={open}
      onClick={() => setOpen((value) => !value)}
      aria-label="Sort order"
      className="fixed left-1/2 top-2 z-[120] inline-flex h-7 -translate-x-1/2 cursor-pointer items-center gap-1 rounded-full border border-dashed border-amber-500 bg-amber-50 px-2.5 text-xs font-semibold text-amber-800 shadow-sm"
    >
      <ArrowUpDown className="h-3.5 w-3.5" aria-hidden />
      <span className="max-[359px]:sr-only">Sort</span>
    </button>
  );

  const body = <SortDebugBody order={order} onChange={onChange} />;
  let panel = null;
  if (open && desktop) {
    panel = (
      <aside data-picker-keep-open className="flex h-full w-[min(40%,400px)] shrink-0 flex-col border-l bg-background">
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
          <span className="text-sm font-semibold text-foreground">Selector sort order</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close sort order"
            className="shrink-0 cursor-pointer rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </aside>
    );
  } else if (open) {
    panel = (
      <BottomSheet
        onClose={() => setOpen(false)}
        closeLabel="Close sort order"
        title={<span className="text-sm font-semibold text-foreground">Selector sort order</span>}
        layerZIndex={130}
      >
        {body}
      </BottomSheet>
    );
  }

  return (
    <>
      {button}
      {panel}
    </>
  );
}

function SortDebugBody({ order, onChange }: { order: SortOrder; onChange: (order: SortOrder) => void }) {
  const [copied, setCopied] = useState(false);
  const text = formatSortOrder(order);
  const off = SORT_KEYS.map((key) => key.id).filter((id) => !order.includes(id));

  function toggle(id: SortKeyId) {
    onChange(order.includes(id) ? order.filter((other) => other !== id) : [...order, id]);
  }

  function move(index: number, by: -1 | 1) {
    const next = order.slice();
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div data-testid="favorites-sort-debug" className="flex flex-col gap-3 px-3 pb-4 pt-3">
      <div className="grid grid-cols-2 gap-1.5">
        {SORT_PRESETS.map((preset) => {
          const active = sameSortOrder(order, preset.order);
          return (
            <button
              key={preset.id}
              type="button"
              data-testid={`favorites-sort-preset-${preset.id}`}
              aria-pressed={active}
              onClick={() => onChange(preset.order)}
              className={`min-h-9 cursor-pointer rounded-md border px-2 text-xs font-medium transition-colors ${active ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-foreground hover:bg-muted'}`}
            >
              {preset.label}
            </button>
          );
        })}
      </div>

      <ol className="flex flex-col divide-y rounded-md border">
        {order.map((id, index) => (
          <KeyRow
            key={id}
            id={id}
            position={index + 1}
            enabled
            onToggle={() => toggle(id)}
            onUp={index > 0 ? () => move(index, -1) : undefined}
            onDown={index < order.length - 1 ? () => move(index, 1) : undefined}
          />
        ))}
        <li data-testid="favorites-sort-key-dex" className={ROW}>
          <span className={POSITION}>{order.length + 1}</span>
          <input type="checkbox" checked disabled aria-label={DEX_KEY.label} className={CHECKBOX} />
          <KeyText label={DEX_KEY.label} description={DEX_KEY.description} />
        </li>
        {off.map((id) => (
          <KeyRow key={id} id={id} enabled={false} onToggle={() => toggle(id)} />
        ))}
      </ol>

      <div className="flex items-center gap-2">
        <code data-testid="favorites-sort-order" className="min-w-0 flex-1 break-all rounded bg-muted px-2 py-1 text-[0.6875rem] leading-snug text-foreground">
          {text}
        </code>
        <button
          type="button"
          data-testid="favorites-sort-copy"
          onClick={copy}
          className="inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground hover:bg-muted"
        >
          {copied ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
          {copied ? 'Copied' : 'Copy order'}
        </button>
      </div>
    </div>
  );
}

function KeyRow({
  id,
  position,
  enabled,
  onToggle,
  onUp,
  onDown,
}: {
  id: SortKeyId;
  position?: number;
  enabled: boolean;
  onToggle: () => void;
  onUp?: () => void;
  onDown?: () => void;
}) {
  const key = sortKey(id);
  const moveClass = 'grid h-8 w-8 cursor-pointer place-items-center rounded-md border border-border bg-card text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-30';
  return (
    <li data-testid={`favorites-sort-key-${id}`} data-enabled={enabled} className={`${ROW} ${enabled ? '' : 'bg-muted/40'}`}>
      <span className={POSITION}>{position ?? '–'}</span>
      <input
        type="checkbox"
        data-testid={`favorites-sort-toggle-${id}`}
        checked={enabled}
        onChange={onToggle}
        aria-label={key.label}
        className={`${CHECKBOX} cursor-pointer`}
      />
      <KeyText label={key.label} description={key.description} muted={!enabled} />
      {enabled ? (
        <div className="col-start-4 row-start-1 flex gap-1">
          <button type="button" data-testid={`favorites-sort-up-${id}`} aria-label={`Move ${key.label} up`} disabled={!onUp} onClick={onUp} className={moveClass}>
            <ArrowUp className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" data-testid={`favorites-sort-down-${id}`} aria-label={`Move ${key.label} down`} disabled={!onDown} onClick={onDown} className={moveClass}>
            <ArrowDown className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  );
}

const ROW = 'grid grid-cols-[1rem_1rem_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 px-2 py-2';
const POSITION = 'text-right text-xs tabular-nums text-muted-foreground';
const CHECKBOX = 'h-4 w-4 accent-primary';

function KeyText({ label, description, muted = false }: { label: string; description: string; muted?: boolean }) {
  return (
    <>
      <span className={`col-start-3 row-start-1 min-h-8 content-center text-sm font-medium leading-tight ${muted ? 'text-muted-foreground' : 'text-foreground'}`}>{label}</span>
      <span className="col-span-3 col-start-2 row-start-2 text-xs leading-snug text-muted-foreground">{description}</span>
    </>
  );
}
