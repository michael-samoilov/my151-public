import { useMemo, useState } from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useT } from '@/i18n';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PanelRightClose } from 'lucide-react';
import { isGenNumber, isTypeName, type GenAxisId, type TypeAxisId } from '../model/cells';
import { eligibleFor, kindFor } from '../model/eligibility';
import { getPickerMon, type PickerMon } from '../model/catalog';
import {
  enumeratePaths,
  packingNeeded,
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
  const kind = kindFor(type, gen);
  const [packing, setPacking] = useState<{ incoming: PickerMon; chains: { path: PackMove[]; slots: ChainSlot[] }[] } | null>(null);

  const mons = useMemo(() => {
    if (kind === 'pointer') {
      return pointerPool(type, gen, fills)
        .map(getPickerMon)
        .filter((m): m is PickerMon => Boolean(m));
    }
    return eligibleFor(type, gen);
  }, [kind, type, gen, fills]);

  const maxCols = desktop ? 6 : 5;

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
        if (chains.length === 1 && !map[type]) {
          onApplyPack(chains[0].path);
          onClose();
          return;
        }
        setPacking({ incoming: mon, chains });
        return;
      }
    }
    onPlace(mon.id);
    onClose();
  }

  const body = packing ? (
    <div className="flex flex-col gap-2 px-3 pb-4" data-testid="favorites-packing">
      <p className="text-sm text-muted-foreground">{t('favorites.packing.heading')}</p>
      {packing.chains.map((c, i) => (
        <PackingChain
          key={i}
          slots={c.slots}
          onSelect={() => {
            onApplyPack(c.path);
            onClose();
          }}
        />
      ))}
      <button
        type="button"
        className="self-start text-sm text-muted-foreground underline"
        onClick={() => setPacking(null)}
      >
        {t('favorites.packing.back')}
      </button>
    </div>
  ) : (
    <div className="px-3 pb-4">
      {mons.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('favorites.empty')}</p>
      ) : (
        <PrettySpriteGrid mons={mons} maxCols={maxCols} selectedId={currentId} onPick={pick} />
      )}
      {currentId != null ? (
        <button
          type="button"
          data-testid="favorites-clear"
          className="mt-3 text-sm text-muted-foreground underline"
          onClick={() => {
            onClear();
            onClose();
          }}
        >
          {t('favorites.clear')}
        </button>
      ) : null}
    </div>
  );

  const title = <PickerTitle type={type} gen={gen} />;

  if (desktop) {
    return (
      <aside
        className="flex h-full w-[min(26rem,40vw)] shrink-0 flex-col border-l bg-card"
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
    <BottomSheet onClose={onClose} title={title} closeLabel={t('favorites.close')} size="full">
      <div data-testid="favorites-picker">{body}</div>
    </BottomSheet>
  );
}
