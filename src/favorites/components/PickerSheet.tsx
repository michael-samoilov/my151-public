import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { pickerRowInsetPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { ChevronLeft, PanelRightClose } from 'lucide-react';
import { isGenNumber, isTypeName, typeSlottedElsewhere, type GenAxisId, type TypeAxisId } from '../model/cells';
import { eligibleFor, kindFor } from '../model/eligibility';
import { evolutionLineKey, getPickerMon, type PickerMon } from '../model/catalog';
import {
  chainSlotKey,
  enumeratePaths,
  packingNeeded,
  packListMode,
  packStepOptions,
  typeMapFromFills,
  uniqueChains,
  type ChainSlot,
  type PackMove,
} from '../model/packing';
import { pointerMarks, pointerPool } from '../model/pointers';
import { PickerTitle } from './PickerTitle';
import { PrettySpriteGrid } from './PrettySpriteGrid';
import { PackingChain } from './PackingChain';

// Keep the chain picker available for a possible future opt-in, but default to
// the direct replacement flow until its choices are understandable at a glance.
// `?packing=1` turns it on outside production so its specs keep running.
const PACKING_UI_ENABLED = !PRODUCTION_DEPLOY && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('packing') === '1';

export type PickerAnchor = { cell: HTMLElement; table: HTMLElement };
type PopoverPosition = { left: number; top: number; width: number; maxHeight: number };

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function PickerSheet({
  type,
  gen,
  fills,
  currentId,
  anchor,
  showTypes,
  onToggleTypes,
  onClose,
  onPlace,
  onApplyPack,
  onClear,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  fills: Record<string, number>;
  currentId?: number;
  anchor: PickerAnchor | null;
  showTypes: boolean;
  onToggleTypes: () => void;
  onClose: () => void;
  onPlace: (id: number) => void;
  onApplyPack: (path: PackMove[]) => void;
  onClear: () => void;
}) {
  const t = useT();
  const desktop = useIsDesktop();
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const inset = pickerRowInsetPx(viewportPx, spritePx);
  const kind = kindFor(type, gen);
  const [packing, setPacking] = useState<{ incoming: PickerMon; chains: { path: PackMove[]; slots: ChainSlot[] }[] } | null>(null);
  const [packStack, setPackStack] = useState<string[]>(['']);
  const popoverRef = useRef<HTMLElement>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);

  function backFromPack() {
    if (packStack.length > 1) setPackStack(packStack.slice(0, -1));
    else setPacking(null);
  }

  const mons = useMemo(() => {
    if (kind === 'pointer') {
      return pointerPool(type, gen, fills)
        .map(getPickerMon)
        .filter((m): m is PickerMon => Boolean(m));
    }
    return eligibleFor(type, gen);
  }, [kind, type, gen, fills]);

  const maxCols = 6;
  const lineKey = kind === 'pick' && type === 'starter' ? evolutionLineKey : undefined;
  const widestRow = Math.max(0, ...prettyRows(mons, maxCols, lineKey).map((row) => row.length));
  const paneWidth = Math.max(
    mons.length === 0 ? 290 : kind === 'pick' && isTypeName(type) && isGenNumber(gen) ? 200 : 150,
    spritePx * widestRow + inset * 2 + 2,
  );

  useLayoutEffect(() => {
    const popover = popoverRef.current;
    if (!desktop || !anchor || !popover) return;
    const update = () => {
      const table = anchor.table.getBoundingClientRect();
      const cell = anchor.cell.getBoundingClientRect();
      const visual = window.visualViewport;
      const leftBound = Math.max(table.left, visual?.offsetLeft ?? 0);
      const rightBound = Math.min(table.right, (visual?.offsetLeft ?? 0) + (visual?.width ?? window.innerWidth));
      const topBound = Math.max(table.top, visual?.offsetTop ?? 0);
      const bottomBound = Math.min(table.bottom, (visual?.offsetTop ?? 0) + (visual?.height ?? window.innerHeight));
      if (rightBound <= leftBound || bottomBound <= topBound) return;
      const width = Math.min(paneWidth, rightBound - leftBound);
      // scrollHeight excludes the outer border and rounds to an integer, so
      // reserve a few pixels before clamping against the table/viewport edge.
      const maxHeight = Math.max(0, bottomBound - topBound - 4);
      const height = Math.min(popover.scrollHeight + 4, maxHeight);
      const gap = 8;
      const below = cell.bottom + gap;
      const above = cell.top - height - gap;
      const right = cell.right + gap;
      const left = cell.left - width - gap;
      // Prefer below or above the cell. A zoomed cell can leave no room for
      // either, so fall back to its side before covering it.
      const place = below + height <= bottomBound ? { left: cell.left, top: below }
        : above >= topBound ? { left: cell.left, top: above }
          : right + width <= rightBound ? { left: right, top: cell.top }
            : left >= leftBound ? { left, top: cell.top }
              : { left: cell.left, top: below };
      const next = {
        left: clamp(place.left, leftBound, rightBound - width),
        top: clamp(place.top, topBound, bottomBound - height),
        width,
        maxHeight,
      };
      setPosition((current) => current?.left === next.left && current.top === next.top
        && current.width === next.width && current.maxHeight === next.maxHeight
        ? current : next);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(anchor.table);
    observer.observe(anchor.cell);
    observer.observe(popover);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    window.visualViewport?.addEventListener('resize', update);
    window.visualViewport?.addEventListener('scroll', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
      window.visualViewport?.removeEventListener('resize', update);
      window.visualViewport?.removeEventListener('scroll', update);
    };
  }, [desktop, anchor, paneWidth]);
  const emptyHint = kind !== 'pointer' ? t('favorites.empty.unavailable')
    : type === 'favorite' && gen === 'favorite' ? t('favorites.empty.overall')
      : type === 'legendary' && gen === 'legendary' ? t('favorites.empty.legendary')
        : type === 'favorite' ? t('favorites.empty.row')
          : t('favorites.empty.column');

  function pick(mon: PickerMon) {
    if (mon.id === currentId) {
      onClose();
      return;
    }
    if (PACKING_UI_ENABLED && kind === 'pick' && isTypeName(type) && isGenNumber(gen)) {
      const map = typeMapFromFills(fills, gen, getPickerMon);
      if (packingNeeded(map, type, mon)) {
        const { paths } = enumeratePaths(map, type, mon);
        const chains = uniqueChains(paths);
        setPackStack(['']);
        setPacking({ incoming: mon, chains });
        return;
      }
    }
    onPlace(mon.id);
    onClose();
  }

  const body = packing ? (
    <PackList
      chains={packing.chains}
      stack={packStack}
      onStack={setPackStack}
      onApply={(path) => {
        onApplyPack(path);
        onClose();
      }}
      heading={t('favorites.packing.heading')}
    />
  ) : (
    <div className={mons.length === 0 && currentId == null ? 'pb-4 pt-3' : 'pb-4'} style={{ paddingTop: mons.length > 0 && currentId != null ? 4 : undefined, paddingLeft: inset, paddingRight: inset }}>
      {mons.length === 0 && currentId == null ? (
        <PickerEmptyState title={t('favorites.empty.title')} hint={emptyHint} backLabel={t('favorites.empty.back')} onBack={onClose} />
      ) : (
        <PrettySpriteGrid
          mons={mons}
          maxCols={maxCols}
          lineKey={lineKey}
          selectedId={currentId}
          onPick={pick}
          usedIn={kind === 'pick' && isTypeName(type) ? (id) => typeSlottedElsewhere(fills, id, type, gen) : undefined}
          showTypes={showTypes && kind === 'pick' && isTypeName(type) && isGenNumber(gen)}
          pointer={kind === 'pointer'}
          sourceMarks={kind === 'pointer' ? (id) => pointerMarks(type, gen, fills, id) : undefined}
          onClear={
            currentId != null
              ? () => {
                  onClear();
                  onClose();
                }
              : undefined
          }
          clearLabel={t('favorites.clear')}
        />
      )}
    </div>
  );

  const title = <PickerTitle type={type} gen={gen} />;
  const typeToggle = kind === 'pick' && isTypeName(type) && isGenNumber(gen) ? (
    <button
      type="button"
      data-testid="favorites-type-toggle"
      aria-pressed={showTypes}
      onClick={onToggleTypes}
      className={`inline-flex min-h-8 shrink-0 cursor-pointer items-center rounded-md border px-2.5 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${showTypes ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
    >
      {showTypes ? t('favorites.types.hide') : t('favorites.types.show')}
    </button>
  ) : null;
  const mobileTitle = (
    <span className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left">
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {title}
    </span>
  );

  if (desktop) {
    return (
      <aside
        ref={popoverRef}
        className="fixed z-40 flex flex-col overflow-hidden rounded-xl border bg-card shadow-xl"
        style={{
          left: position?.left ?? 0,
          top: position?.top ?? 0,
          width: position?.width ?? paneWidth,
          maxHeight: position?.maxHeight,
          visibility: position ? 'visible' : 'hidden',
        }}
        data-testid="favorites-picker"
      >
        <div className="flex h-11 shrink-0 items-center justify-between border-b px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {packing ? (
              <button type="button" onClick={backFromPack} aria-label={t('favorites.packing.back')} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            {title}
          </div>
          <div className="flex items-center gap-2">
            {typeToggle}
            <button type="button" onClick={onClose} aria-label={t('favorites.close')} className="cursor-pointer p-1 text-muted-foreground">
              <PanelRightClose size={16} />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </aside>
    );
  }

  return (
    <BottomSheet
      onClose={onClose}
      onHeaderClick={packing ? backFromPack : undefined}
      headerLabel={packing ? t('favorites.packing.back') : undefined}
      title={mobileTitle}
      headerAccessory={typeToggle}
      closeLabel={t('favorites.close')}
      size="content"
    >
      <div data-testid="favorites-picker">{body}</div>
    </BottomSheet>
  );
}

function PackList({
  chains,
  stack,
  onStack,
  onApply,
  heading,
}: {
  chains: { path: PackMove[]; slots: ChainSlot[] }[];
  stack: string[];
  onStack: (next: string[]) => void;
  onApply: (path: PackMove[]) => void;
  heading: string;
}) {
  const t = useT();
  if (chains.length === 0) {
    return <PickerEmptyState title={t('favorites.empty.packing.title')} hint={t('favorites.empty.packing.hint')} />;
  }
  const mode = packListMode(chains);
  const prefix = stack[stack.length - 1] ?? '';
  const options = mode === 'stepped' ? packStepOptions(chains, prefix) : [];
  return (
    <div className="flex flex-col gap-2 px-3 pb-4" data-testid="favorites-packing" data-pack-mode={mode}>
      <p className="text-sm text-muted-foreground">{heading}</p>
      {mode === 'full'
        ? chains.map((chain) => (
            <PackingChain
              key={chain.slots.map(chainSlotKey).join('|')}
              slots={chain.slots}
              onSelect={() => onApply(chain.path)}
            />
          ))
        : options.map((option) => (
            <PackingChain
              key={option.key}
              slots={option.slots}
              onSelect={() => {
                if (option.path) onApply(option.path);
                else onStack([...stack, option.prefix]);
              }}
            />
          ))}
    </div>
  );
}

function PickerEmptyState({
  title,
  hint,
  backLabel,
  onBack,
}: {
  title: string;
  hint: string;
  backLabel?: string;
  onBack?: () => void;
}) {
  return (
    <section
      data-testid="favorites-picker-empty"
      className="mx-auto flex w-full max-w-[270px] flex-col items-center rounded-xl border border-border bg-muted/30 px-5 py-5 text-center"
    >
      <div className="mb-3 grid h-[76px] w-[76px] place-items-center rounded-2xl border border-border bg-card" aria-hidden>
        <svg data-testid="favorites-empty-unown" viewBox="0 0 500 900" className="h-[68px] w-[40px] text-foreground" fill="none">
          <path d="M172 109C245 73 347 99 392 176C455 284 388 401 246 421V521" stroke="currentColor" strokeWidth="90" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="246" cy="680" r="208" fill="currentColor" />
          <path d="M130 680C130 746 181 796 246 796S362 746 362 680Z" fill="var(--color-card)" />
          <circle cx="246" cy="680" r="49" fill="currentColor" />
        </svg>
      </div>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      {backLabel && onBack ? <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-card px-3.5 py-2 text-xs font-medium text-foreground hover:border-primary/40 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        <ChevronLeft size={14} aria-hidden />
        {backLabel}
      </button> : null}
    </section>
  );
}
