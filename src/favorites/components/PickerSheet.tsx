import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { pickerRowInsetPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import { t as translate, typeLabel, useT } from '@/i18n';
import { EmptyState, type EmptyStateAction } from '@/components/shared/EmptyState';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { isGenNumber, isTypeName, isTypeCell, parseCellKey, type GenAxisId, type TypeAxisId } from '../model/cells';
import { eligibleFor, kindFor } from '../model/eligibility';
import { evolutionLineKey, getPickerMon, type PickerMon } from '../model/catalog';
import type { SortOrder } from '../model/sortKeys';
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
import { pointerMarks, pointerPool, pointerCoordinates, pointerSourceKeys } from '../model/pointers';
import { takenIn, pickedCoordinatesElsewhere } from '../model/taken';
import { coordinateLabel } from './coordinatePresentation';
import { generationLabel } from './badgeStyle';
import { PickerTitle } from './PickerTitle';
import { PrettySpriteGrid } from './PrettySpriteGrid';
import { PackingChain } from './PackingChain';
import { DesktopPane } from './DesktopPane';

const PACKING_UI_ENABLED = !PRODUCTION_DEPLOY && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('packing') === '1';

export function PickerSheet({
  type,
  gen,
  autoFocus = false,
  fills,
  currentId,
  showIcons,
  sortOrder,
  onToggleIcons,
  onClose,
  onPlace,
  onApplyPack,
  onClear,
  onOpenCell,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  autoFocus?: boolean;
  fills: Record<string, number>;
  currentId?: number;
  showIcons: boolean;
  sortOrder: SortOrder;
  onToggleIcons: () => void;
  onClose: () => void;
  onPlace: (id: number) => void;
  onApplyPack: (path: PackMove[]) => void;
  onClear: () => void;
  onOpenCell: (type: TypeAxisId, gen: GenAxisId, keyboard: boolean) => void;
}) {
  const bodyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus) return;
    const frame = requestAnimationFrame(() => {
      const first = bodyRef.current?.querySelector<HTMLButtonElement>('button[data-testid^="favorites-pick-"]')
        ?? bodyRef.current?.querySelector<HTMLButtonElement>('button');
      first?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, type, gen]);
  const t = useT();
  const desktop = useIsDesktop();
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const inset = pickerRowInsetPx(viewportPx, spritePx);
  const kind = kindFor(type, gen);
  const [packing, setPacking] = useState<{ incoming: PickerMon; chains: { path: PackMove[]; slots: ChainSlot[] }[] } | null>(null);
  const [packStack, setPackStack] = useState<string[]>(['']);
  const iconToggleRef = useRef<HTMLButtonElement>(null);
  const [iconToggleWidth, setIconToggleWidth] = useState(0);

  useLayoutEffect(() => {
    const button = iconToggleRef.current;
    if (!button) return;
    const measure = () => setIconToggleWidth(button.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(button);
    return () => observer.disconnect();
  }, [desktop, t, type, gen]);

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
    return eligibleFor(type, gen, sortOrder);
  }, [kind, type, gen, fills, sortOrder]);
  const pickedCoordinates = useMemo(() => pickedCoordinatesElsewhere(fills, type, gen), [fills, type, gen]);
  const taken = useMemo(() => takenIn(fills, type, gen), [fills, type, gen]);

  const maxCols = 6;
  const lineKey = kind === 'pick' && type === 'starter' && isGenNumber(gen) ? evolutionLineKey : undefined;
  const widestRow = Math.max(0, ...prettyRows(mons, maxCols, lineKey).map((row) => row.length));
  const paneWidth = Math.max(
    mons.length === 0 ? 290 : kind === 'pick' && isTypeName(type) && isGenNumber(gen) ? 200 : 150,
    spritePx * widestRow + inset * 2 + 2,
  );

  const empty = mons.length === 0 ? emptyCopy(type, gen, fills, onOpenCell) : null;

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
    <div ref={bodyRef} id="favorites-selector" className={mons.length === 0 && currentId == null ? 'pb-4 pt-3' : 'pb-4'} style={{ paddingTop: mons.length > 0 && currentId != null ? 4 : undefined, paddingLeft: inset, paddingRight: inset }}>
      {empty && currentId == null ? (
        <EmptyState testId="favorites-picker-empty" className="max-w-[17rem] px-5" {...empty} />
      ) : (
        <PrettySpriteGrid
          mons={mons}
          maxCols={maxCols}
          lineKey={lineKey}
          selectedId={currentId}
          onPick={pick}
          takenMarks={kind === 'pick' ? (id) => taken.get(id) ?? [] : undefined}
          showIcons={showIcons}
          pointer={kind === 'pointer'}
          originContext={{ type, gen }}
          coordinates={kind === 'pointer' ? (id) => pointerCoordinates(type, gen, fills, id)
            : !isTypeCell(type, gen) ? (id) => pickedCoordinates.get(id) ?? [] : undefined}
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

  const title = <PickerTitle type={type} gen={gen}
    maxWidth={desktop ? undefined : Math.max(1, viewportPx - (mons.length > 0 ? iconToggleWidth : 0) - 16 - (packing ? 20 : 0))}
    gapPx={desktop ? 6 : 2} />;
  const iconToggle = mons.length === 0 ? null : (
    <button
      type="button"
      ref={iconToggleRef}
      data-testid="favorites-type-toggle"
      aria-pressed={showIcons}
      aria-label={showIcons ? t('favorites.icons.hide') : t('favorites.icons.show')}
      title={showIcons ? t('favorites.icons.hide') : t('favorites.icons.show')}
      onClick={onToggleIcons}
      className={`inline-flex h-7 shrink-0 cursor-pointer items-center rounded-md border text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${desktop ? 'gap-1.5 px-2.5' : 'gap-1 px-1'} whitespace-nowrap ${showIcons ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border bg-card text-muted-foreground hover:text-foreground'}`}
    >
      {showIcons ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
      <span className="grid">
        <span className="invisible col-start-1 row-start-1" aria-hidden>{t('favorites.icons.hide')}</span>
        <span className="invisible col-start-1 row-start-1" aria-hidden>{t('favorites.icons.show')}</span>
        <span className="col-start-1 row-start-1">{showIcons ? t('favorites.icons.hide') : t('favorites.icons.show')}</span>
      </span>
    </button>
  );
  const mobileTitle = (
    <span className="flex w-full items-center gap-1 px-1 py-0.5 text-left">
      {packing ? <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
      {title}
    </span>
  );

  if (desktop) {
    return (
      <DesktopPane type={type} gen={gen} minWidth={paneWidth} onClose={onClose}>
        <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {packing ? (
              <button type="button" onClick={backFromPack} aria-label={t('favorites.packing.back')} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            {title}
          </div>
          {iconToggle}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{body}</div>
      </DesktopPane>
    );
  }

  return (
    <BottomSheet
      onClose={onClose}
      onHeaderClick={packing ? backFromPack : undefined}
      headerLabel={packing ? t('favorites.packing.back') : undefined}
      title={mobileTitle}
      headerAccessory={iconToggle}
      closeLabel={t('favorites.close')}
      dialogLabel={coordinateLabel(type, gen)}
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
    return <EmptyState testId="favorites-picker-empty" className="max-w-[17rem] px-5" title={t('favorites.empty.packing.title')} body={t('favorites.empty.packing.hint')} />;
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

type Cell = { type: TypeAxisId; gen: GenAxisId };

function axisLabel(axis: TypeAxisId | GenAxisId): string {
  if (isGenNumber(axis)) return generationLabel(axis);
  if (isTypeName(axis)) return typeLabel(axis);
  return translate(`favorites.axis.${axis}`);
}

function nextCell(type: TypeAxisId, gen: GenAxisId, fills: Record<string, number>): Cell | null {
  const sources = pointerSourceKeys(type, gen).map(parseCellKey).filter((cell): cell is Cell => cell != null);
  const ready = sources.find((cell) => {
    const kind = kindFor(cell.type, cell.gen);
    return kind === 'pick' || (kind === 'pointer' && pointerPool(cell.type, cell.gen, fills).length > 0);
  });
  if (ready) return ready;
  const deeper = sources.find((cell) => kindFor(cell.type, cell.gen) === 'pointer');
  return deeper ? nextCell(deeper.type, deeper.gen, fills) : null;
}

function emptyCopy(
  type: TypeAxisId,
  gen: GenAxisId,
  fills: Record<string, number>,
  onOpenCell: (type: TypeAxisId, gen: GenAxisId, keyboard: boolean) => void,
): { title: string; body: string; action?: EmptyStateAction } {
  if (kindFor(type, gen) !== 'pointer') {
    return { title: translate('favorites.empty.unavailable.title'), body: translate('favorites.empty.unavailable.body') };
  }
  const row = type === 'favorite' && gen !== 'favorite';
  const target = nextCell(type, gen, fills);
  const action: EmptyStateAction | undefined = target ? {
    label: kindFor(target.type, target.gen) === 'pointer' ? translate('favorites.empty.overall.action')
      : row ? translate('favorites.empty.row.action', { gen: axisLabel(target.gen) })
        : translate('favorites.empty.column.action', { type: axisLabel(target.type) }),
    onClick: (event) => onOpenCell(target.type, target.gen, event.detail === 0),
  } : undefined;
  if (type === 'favorite' && gen === 'favorite') {
    return { title: translate('favorites.empty.overall.title'), body: translate('favorites.empty.overall.body'), action };
  }
  if (row) {
    const name = axisLabel(gen);
    return { title: translate('favorites.empty.row.title', { gen: name }), body: translate('favorites.empty.row.body', { gen: name }), action };
  }
  const name = axisLabel(type);
  const both = type === gen;
  return {
    title: translate('favorites.empty.column.title', { type: name }),
    body: both ? translate('favorites.empty.pointer.body', { type: name }) : translate('favorites.empty.column.body', { type: name }),
    action,
  };
}
