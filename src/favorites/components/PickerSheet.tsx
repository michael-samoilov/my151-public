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
  enumeratePaths,
  packingNeeded,
  packListMode,
  packStepOptions,
  typeMapFromFills,
  uniqueChains,
  type ChainSlot,
  type PackMove,
} from '../model/packing';
import { pointerPool } from '../model/pointers';
import { PickerTitle } from './PickerTitle';
import { PrettySpriteGrid } from './PrettySpriteGrid';
import { PackingChain } from './PackingChain';

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
      onBack={backFromPack}
      heading={t('favorites.packing.heading')}
      backLabel={t('favorites.packing.back')}
    />
  ) : (
    <div className="pb-4" style={{ paddingLeft: inset, paddingRight: inset }}>
      {mons.length === 0 && currentId == null ? (
        <p className="text-sm text-muted-foreground">{t('favorites.empty')}</p>
      ) : (
        <PrettySpriteGrid
          mons={mons}
          maxCols={maxCols}
          lineKey={type === 'starter' ? evolutionLineKey : undefined}
          selectedId={currentId}
          onPick={pick}
          usedIn={(id) => typeSlottedElsewhere(fills, id, type, gen)}
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
  const mobileTitle = (
    <span className="flex w-full items-center gap-1.5 px-2 py-0.5 text-left">
      <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-primary text-primary">
        <ChevronLeft size={15} aria-hidden />
      </span>
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
          {title}
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
  onBack,
  heading,
  backLabel,
}: {
  chains: { path: PackMove[]; slots: ChainSlot[] }[];
  stack: string[];
  onStack: (next: string[]) => void;
  onApply: (path: PackMove[]) => void;
  onBack: () => void;
  heading: string;
  backLabel: string;
}) {
  const mode = packListMode(chains);
  const prefix = stack[stack.length - 1] ?? '';
  const options = mode === 'stepped' ? packStepOptions(chains, prefix) : [];
  return (
    <div className="flex flex-col gap-2 px-3 pb-4" data-testid="favorites-packing" data-pack-mode={mode}>
      <p className="text-sm text-muted-foreground">{heading}</p>
      {mode === 'full'
        ? chains.map((chain) => (
            <PackingChain
              key={chain.slots.map((slot) => `${slot.role}:${slot.type ?? ''}:${slot.mon?.id ?? ''}`).join('|')}
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
      <button
        type="button"
        className="self-start text-sm text-muted-foreground underline"
        onClick={onBack}
      >
        {backLabel}
      </button>
    </div>
  );
}
