import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { HOVER_LAYER } from '@/components/ui/hoverLayer';
import { useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { pickerRowInsetPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { prettyRows } from '../model/prettyWrap';
import { t as translate, typeLabel, useLocale, useT } from '@/i18n';
import { useTightFit } from '@/hooks/useTightFit';
import { EmptyState, type EmptyStateAction } from '@/components/shared/EmptyState';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PRODUCTION_DEPLOY } from '@/lib/demoMode';
import { usePreloadImages } from '@/lib/imagePreload';
import { ChevronLeft, Eye, EyeOff } from 'lucide-react';
import { cellKey, isGenNumber, isTypeName, isTypeCell, parseCellKey, type GenAxisId, type TypeAxisId } from '../model/cells';
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
import { isShinyCell, pickerShinySprite, pointerOptions } from '../model/shiny';
import { ShinyToggle } from '@/components/shiny/ShinyToggle';
import { PILL_CLASS, PILL_OFF, pillStyle } from '@/components/shiny/pill';
import { cn } from '@/lib/utils';
import { coordinateLabel } from './coordinatePresentation';
import { generationLabel } from './badgeStyle';
import { PickerTitle } from './PickerTitle';
import { pickerTitleFullWidth, TITLE_BADGE_PX } from './titleGeometry';
import { PrettySpriteGrid, type SelectorOption } from './PrettySpriteGrid';
import { PackingChain } from './PackingChain';
import { DesktopPane } from './DesktopPane';

const PACKING_UI_ENABLED = !PRODUCTION_DEPLOY && typeof window !== 'undefined'
  && new URLSearchParams(window.location.search).get('packing') === '1';

/** A pointer option also names the source cells that show it in its look. A pick option has none. */
type SheetOption = SelectorOption & { sources: readonly string[] };

export function PickerSheet({
  type,
  gen,
  autoFocus = false,
  fills,
  shiny,
  currentId,
  showIcons,
  shinyView,
  sortOrder,
  onToggleIcons,
  onToggleShiny,
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
  shiny: Readonly<Record<string, number>>;
  currentId?: number;
  showIcons: boolean;
  shinyView: boolean;
  sortOrder: SortOrder;
  onToggleIcons: () => void;
  onToggleShiny: () => void;
  onClose: () => void;
  onPlace: (id: number, shiny: boolean) => void;
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
  const locale = useLocale();
  const desktop = useIsDesktop();
  const viewportPx = useLayoutViewportCssPx();
  const spritePx = pickerSpriteCssPx(viewportPx);
  const inset = pickerRowInsetPx(viewportPx, spritePx);
  const kind = kindFor(type, gen);
  const [packing, setPacking] = useState<{ incoming: PickerMon; chains: { path: PackMove[]; slots: ChainSlot[] }[] } | null>(null);
  const [packStack, setPackStack] = useState<string[]>(['']);
  const headerButtonsRef = useRef<HTMLDivElement>(null);
  const [headerButtonsWidth, setHeaderButtonsWidth] = useState(0);

  useLayoutEffect(() => {
    const buttons = headerButtonsRef.current;
    if (!buttons) return;
    const measure = () => setHeaderButtonsWidth(buttons.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(buttons);
    return () => observer.disconnect();
  }, [desktop, t, type, gen]);

  function backFromPack() {
    if (packStack.length > 1) setPackStack(packStack.slice(0, -1));
    else setPacking(null);
  }

  const picks = useMemo(() => (kind === 'pick' ? eligibleFor(type, gen, sortOrder) : []), [kind, type, gen, sortOrder]);
  // A pick sheet shows the look the switch asks for; a pointer sheet shows each Pokémon in each look its sources show it in.
  const options = useMemo((): SheetOption[] => (kind === 'pointer'
    ? pointerOptions(type, gen, fills, shiny).flatMap(({ id, shiny: look, sources }) => {
      const mon = getPickerMon(id);
      return mon ? [{ mon, shiny: look, sources }] : [];
    })
    : picks.map((mon) => ({ mon, shiny: shinyView, sources: [] }))), [kind, type, gen, fills, shiny, picks, shinyView]);
  const shinySprites = useMemo(
    () => picks.map((mon) => pickerShinySprite(mon.id)).filter((url): url is string => url !== null),
    [picks],
  );
  usePreloadImages(shinySprites);
  const pickedCoordinates = useMemo(() => pickedCoordinatesElsewhere(fills, type, gen), [fills, type, gen]);
  const taken = useMemo(() => takenIn(fills, type, gen), [fills, type, gen]);

  const maxCols = 6;
  const lineKey = kind === 'pick' && type === 'starter' && isGenNumber(gen) ? (option: SheetOption) => evolutionLineKey(option.mon) : undefined;
  const widestRow = Math.max(0, ...prettyRows(options, maxCols, lineKey).map((row) => row.length));
  const paneWidth = Math.max(
    options.length === 0 ? 290 : kind === 'pick' && isTypeName(type) && isGenNumber(gen) ? 200 : 150,
    spritePx * widestRow + inset * 2 + 2,
  );

  const empty = options.length === 0 ? emptyCopy(type, gen, fills, onOpenCell) : null;

  const key = cellKey(type, gen);
  const placesShiny = (mon: PickerMon) => kind === 'pick' && shinyView && pickerShinySprite(mon.id) !== null;
  const current = currentId == null ? undefined : getPickerMon(currentId);
  const currentShiny = isShinyCell(fills, shiny, key);
  const converting = kind === 'pick' && current != null && placesShiny(current) !== currentShiny;
  const isCurrent = (option: SheetOption) => option.mon.id === currentId && (kind === 'pick' || option.shiny === currentShiny);
  // A pointer option stands for the source cells that show it in its look, so its pills and marks name only those.
  const shownBy = (option: SheetOption) => Object.fromEntries(option.sources.map((source) => [source, option.mon.id]));

  function pick(option: SheetOption) {
    const { mon } = option;
    if (isCurrent(option) && !converting) {
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
    onPlace(mon.id, kind === 'pointer' ? option.shiny : placesShiny(mon));
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
    <div ref={bodyRef} id="favorites-selector" className={options.length === 0 && currentId == null ? 'pb-4 pt-3' : 'pb-4'} style={{ paddingTop: options.length > 0 && currentId != null ? 4 : undefined, paddingLeft: inset, paddingRight: inset }}>
      {empty && currentId == null ? (
        <EmptyState testId="favorites-picker-empty" className="max-w-[17rem] px-5" {...empty} />
      ) : (
        <PrettySpriteGrid
          options={options}
          maxCols={maxCols}
          lineKey={lineKey}
          selected={isCurrent}
          converting={converting}
          onPick={pick}
          takenMarks={kind === 'pick' ? (id) => taken.get(id) ?? [] : undefined}
          showIcons={showIcons}
          pointer={kind === 'pointer'}
          originContext={{ type, gen }}
          coordinates={kind === 'pointer' ? (option) => pointerCoordinates(type, gen, shownBy(option), option.mon.id)
            : !isTypeCell(type, gen) ? (option) => pickedCoordinates.get(option.mon.id) ?? [] : undefined}
          sourceMarks={kind === 'pointer' ? (option) => pointerMarks(type, gen, shownBy(option), option.mon.id) : undefined}
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

  const titleGap = desktop ? 6 : 2;
  const titleRoom = viewportPx - 16 - (packing ? 20 : 0);
  // On a narrow phone, the pills drop their labels before the title badges shrink below the pills' height.
  const headerTight = useTightFit(
    desktop || options.length === 0 ? null : `${titleRoom}|${locale}|${type}|${gen}`,
    headerButtonsRef,
    (buttons) => pickerTitleFullWidth(type, gen, titleGap) + buttons.getBoundingClientRect().width > titleRoom,
  );
  const title = <PickerTitle type={type} gen={gen}
    maxWidth={desktop ? undefined : Math.max(1, titleRoom - (options.length > 0 ? headerButtonsWidth : 0))}
    gapPx={titleGap} />;
  const iconToggle = (
    <button
      type="button"
      data-testid="favorites-type-toggle"
      aria-pressed={showIcons}
      title={showIcons ? t('favorites.icons.hide') : t('favorites.icons.show')}
      onClick={onToggleIcons}
      className={cn(PILL_CLASS, headerTight && 'justify-center', showIcons ? `${HOVER_LAYER} border-[#a3a3a3] bg-secondary text-secondary-foreground [--fill:var(--color-secondary)]` : PILL_OFF)}
      style={pillStyle({ badgePx: TITLE_BADGE_PX, iconOnly: headerTight })}
    >
      {showIcons ? <Eye size={16} className="shrink-0" aria-hidden /> : <EyeOff size={16} className="shrink-0" aria-hidden />}
      <span className={headerTight ? 'sr-only' : undefined}>{t('favorites.icons')}</span>
    </button>
  );
  const headerButtons = options.length === 0 ? null : (
    <div ref={headerButtonsRef} className={`flex shrink-0 items-center ${desktop ? 'gap-2' : 'gap-1.5'}`}>
      {kind === 'pick' ? <ShinyToggle on={shinyView} onToggle={onToggleShiny} badgePx={TITLE_BADGE_PX} iconOnly={headerTight} testId="favorites-shiny-toggle" /> : null}
      {iconToggle}
    </div>
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
          {headerButtons}
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
      headerAccessory={headerButtons}
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
