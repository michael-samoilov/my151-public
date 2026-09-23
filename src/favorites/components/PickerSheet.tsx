import { useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useLayoutViewportCssPx } from '@/lib/usePixelPerfectSprite';
import { pickerRowInsetPx, pickerSpriteCssPx } from '../model/pickerSprite';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
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
import { EmptyBall } from './marks';

export function PickerSheet({
  type,
  gen,
  fills,
  currentId,
  onClose,
  onPlace,
  onApplyPack,
  onClear,
}: {
  type: TypeAxisId;
  gen: GenAxisId;
  fills: Record<string, number>;
  currentId?: number;
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
  const paneWidth = spritePx * 6 + inset * 2 + 2;
  const kind = kindFor(type, gen);
  const [packing, setPacking] = useState<{ incoming: PickerMon; chains: { path: PackMove[]; slots: ChainSlot[] }[] } | null>(null);
  const [packStack, setPackStack] = useState<string[]>(['']);

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
    if (kind === 'pick' && isTypeName(type) && isGenNumber(gen)) {
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
    <div className="pb-4" style={{ paddingTop: currentId != null ? 4 : 0, paddingLeft: inset, paddingRight: inset }}>
      {mons.length === 0 && currentId == null ? (
        <PickerEmptyState title={t('favorites.empty.title')} hint={emptyHint} backLabel={t('favorites.empty.back')} onBack={onClose} />
      ) : (
        <PrettySpriteGrid
          mons={mons}
          maxCols={maxCols}
          lineKey={kind === 'pick' && type === 'starter' ? evolutionLineKey : undefined}
          selectedId={currentId}
          onPick={pick}
          usedIn={kind === 'pick' && isTypeName(type) ? (id) => typeSlottedElsewhere(fills, id, type, gen) : undefined}
          showTypes={kind === 'pick' && isTypeName(type) && isGenNumber(gen)}
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
          clearText={t('browser.clear')}
        />
      )}
    </div>
  );

  const title = <PickerTitle type={type} gen={gen} />;
  const mobileTitle = (
    <span className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left">
      <ChevronLeft className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      {title}
    </span>
  );

  if (desktop) {
    return (
      <aside
        className="flex h-full shrink-0 flex-col border-l bg-card"
        style={{ width: paneWidth }}
        data-testid="favorites-picker"
      >
        <div className="flex h-11 items-center justify-between border-b px-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {packing ? (
              <button type="button" onClick={backFromPack} aria-label={t('favorites.packing.back')} className="cursor-pointer text-muted-foreground hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
            ) : null}
            {title}
          </div>
          <button type="button" onClick={onClose} aria-label={t('favorites.close')} className="cursor-pointer p-1 text-muted-foreground">
            <PanelRightClose size={16} />
          </button>
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
      className="mx-auto flex w-full max-w-[270px] flex-col items-center rounded-2xl border border-primary/10 bg-gradient-to-b from-primary/[0.045] to-transparent px-5 pb-6 pt-5 text-center"
    >
      <div className="relative mb-4 grid h-[76px] w-[76px] place-items-center rounded-full border border-primary/15 bg-card shadow-sm">
        <EmptyBall className="h-11 w-11 text-primary/35" />
        <span className="absolute -bottom-1 -right-1 h-5 w-5 rounded-full border-[3px] border-card bg-primary/30" aria-hidden />
      </div>
      <h2 className="text-sm font-semibold tracking-tight text-foreground">{title}</h2>
      <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">{hint}</p>
      {backLabel && onBack ? <button
        type="button"
        onClick={onBack}
        className="mt-5 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-primary/20 bg-card px-3.5 py-2 text-xs font-medium text-primary shadow-sm hover:bg-primary/5"
      >
        <ChevronLeft size={14} aria-hidden />
        {backLabel}
      </button> : null}
    </section>
  );
}
