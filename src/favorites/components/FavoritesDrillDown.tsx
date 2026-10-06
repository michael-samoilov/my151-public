import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useT } from '@/i18n';
import type { FavoritesExportCell, FavoritesSnapshot } from '../export/snapshot';
import { GEN_AXIS, isGenNumber, ROMAN } from '../model/cells';
import { pointerCoordinates, type SourceCoordinate } from '../model/pointers';
import { labelOf } from './spriteLabel';
import { PrettySpriteGrid } from './PrettySpriteGrid';
import { coordinateLabel } from './coordinatePresentation';

export interface FavoritesDrillDownSelection {
  dimension: 'type' | 'color' | 'shape' | 'evolution' | 'bst';
  key: string;
  label: string;
}

/** Valid pointers describe locations; only contributor cells determine the vote count. */
export function FavoritesDrillDown({ snapshot, contributors, selection, siblings, onNavigate, onClose }: {
  snapshot: FavoritesSnapshot;
  contributors: FavoritesExportCell[];
  selection: FavoritesDrillDownSelection;
  siblings: FavoritesDrillDownSelection[];
  onNavigate: (selection: FavoritesDrillDownSelection) => void;
  onClose: () => void;
}) {
  const t = useT();
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(true);
  const [details, setDetails] = useState<{ name: string; coordinates: SourceCoordinate[] } | null>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const index = siblings.findIndex(item => item.key === selection.key);
  const previous = siblings.length > 1 ? siblings[(index - 1 + siblings.length) % siblings.length] : undefined;
  const next = siblings.length > 1 ? siblings[(index + 1) % siblings.length] : undefined;
  const groups = useMemo(() => GEN_AXIS.filter(row => row !== 'favorite').flatMap(row => {
    const cells = contributors.filter(cell => cell.generation === row);
    const validFills = Object.fromEntries(snapshot.cells.flatMap(cell => cell.mon ? [[cell.key, cell.mon.id]] : []));
    const entries = cells.flatMap(cell => {
      if (!cell.mon) return [];
      const linked = new Set([cell.key]);
      const coordinates: SourceCoordinate[] = [{ type: cell.type, gen: cell.generation,
        mark: isGenNumber(cell.generation) ? { source: 'gen', value: cell.generation } : { source: 'gimmick' } }];
      for (const pointer of snapshot.cells) {
        if (pointer.kind !== 'pointer' || pointer.mon?.id !== cell.mon.id) continue;
        const sources = pointerCoordinates(pointer.type, pointer.generation, validFills, cell.mon.id);
        if (!sources.some(source => linked.has(`${source.type}|${source.gen}`))) continue;
        linked.add(pointer.key);
        coordinates.push({ type: pointer.type, gen: pointer.generation, mark: { source: 'gimmick' } });
      }
      return [{ cell, mon: cell.mon, coordinates }];
    });
    return entries.length ? [{ row, entries }] : [];
  }), [contributors, snapshot]);
  useEffect(() => { close.current?.focus(); }, []);
  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [selection]);
  function navigate(item: FavoritesDrillDownSelection | undefined) { if (item) { setDetails(null); onNavigate(item); } }
  return <div ref={panel} data-testid="favorites-drilldown" data-dimension={selection.dimension} data-category={selection.key}
    role="dialog" aria-label={selection.label}
    className={`absolute z-40 bg-background shadow-xl border flex flex-col overflow-hidden inset-x-0 bottom-0 rounded-t-2xl md:rounded-none md:inset-y-0 md:left-auto md:right-0 md:w-[24rem] ${expanded ? 'h-full' : 'h-20 md:h-full'}`}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'ArrowLeft') navigate(previous);
      if (event.key === 'ArrowRight') navigate(next);
      if (event.key === 'Tab' && panel.current) {
        const buttons = [...panel.current.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
        const first = buttons[0], last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
    <div className="shrink-0 touch-none" onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
      onTouchEnd={event => {
        if (!touch.current) return;
        const dx = event.changedTouches[0].clientX - touch.current.x, dy = event.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) navigate(dx > 0 ? previous : next);
        else if (dy > 80) { if (expanded) setExpanded(false); else onClose(); }
        else if (dy < -40) setExpanded(true);
      }}>
      <button type="button" aria-label={selection.label} onClick={() => setExpanded(value => !value)} className="flex justify-center w-full py-2 md:hidden"><span aria-hidden className="w-10 h-1 rounded-full bg-muted-foreground/30" /></button>
      <div className="flex items-center gap-1 px-2 py-2">
        <button type="button" className="p-2 rounded hover:bg-muted disabled:opacity-30" aria-label={t('favorites.analytics.previous')} disabled={!previous} onClick={() => navigate(previous)}><ChevronLeft className="w-4 h-4" /></button>
        <div className="flex-1 min-w-0 text-center"><h2 className="text-sm font-semibold">{selection.label}</h2><p className="text-xs text-muted-foreground">{t('favorites.analytics.contributors', { count: contributors.length })}</p></div>
        <button type="button" className="p-2 rounded hover:bg-muted disabled:opacity-30" aria-label={t('favorites.analytics.next')} disabled={!next} onClick={() => navigate(next)}><ChevronRight className="w-4 h-4" /></button>
        <button ref={close} type="button" className="p-2 rounded hover:bg-muted" aria-label={t('favorites.analytics.close')} onClick={onClose}><X className="w-4 h-4" /></button>
      </div>
    </div>
    <div className="h-0.5 shrink-0 bg-primary/50" />
    {details && <div className="shrink-0 px-3 py-2 text-xs border-b"><strong>{details.name}</strong><p>{details.coordinates.map(origin => coordinateLabel(origin.type, origin.gen)).join('; ')}</p></div>}
    <div ref={scroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
      {!contributors.length && <p className="text-sm text-muted-foreground py-4">{t('favorites.analytics.noContributors')}</p>}
      {groups.map(group => <section key={group.row} data-contributor-row={group.row}>
        <h3 className="sticky top-0 z-20 bg-background text-xs font-semibold text-muted-foreground py-1 border-b">{isGenNumber(group.row) ? t('favorites.generation', { gen: ROMAN[group.row] }) : t(`favorites.axis.${group.row}`)}</h3>
        <div className="grid grid-cols-4 gap-1 py-1">{group.entries.map(entry => <div key={entry.cell.key} data-contributor-cell={entry.cell.key}>
          <PrettySpriteGrid mons={[entry.mon]} maxCols={1} fitToHeight={false} coordinates={() => entry.coordinates} onPick={() => setDetails({ name: labelOf(entry.mon), coordinates: entry.coordinates })} />
        </div>)}</div>
      </section>)}
    </div>
  </div>;
}
