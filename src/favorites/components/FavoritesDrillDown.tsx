import { useEffect, useMemo, useState } from 'react';
import { useT } from '@/i18n';
import { AnalyticsDrillDownPanel, AnalyticsDrillDownSheet, type AnalyticsDrillDownItem } from '@/components/analytics/DrillDownSheet';
import { PokemonNameText } from '@/components/shared/PokemonNameText';
import type { DrillDownData } from '@/hooks/useDrillDownData';
import { useViewportAtLeast } from '@/lib/usePixelPerfectSprite';
import { TYPE_COLORS } from '@/data/type-colors';
import { typeIconPath } from '@/data/type-ids';
import { COLOR_BADGE_FILLS, type EvolutionRole } from '@/lib/attributeBadgeStyle';
import { evolutionDotsSvg } from '@/components/shared/attributeBadgeSvg';
import type { ColorName, Pokemon, ShapeName, TypeName } from '@/types/pokemon';
import type { FavoritesExportCell, FavoritesSnapshot } from '../export/snapshot';
import { GEN_AXIS, isGenNumber, ROMAN } from '../model/cells';
import { pickerPokemonMetadata } from '../model/metadata';
import { pointerCoordinates, type SourceCoordinate } from '../model/pointers';
import { labelOf, pickerLabelOf } from './spriteLabel';
import { coordinateLabel } from './coordinatePresentation';
import { CoordinatePills } from './CoordinatePills';
import { pickerConditionalContributors } from '../stats/pickerConditionalStats';

export interface FavoritesDrillDownSelection {
  dimension: 'type' | 'color' | 'shape' | 'evolution' | 'bst';
  key: string;
  label: string;
}

/** Picker contributes cells and origins; Dex owns all sheet and tile presentation. */
export function FavoritesDrillDown({ snapshot, contributors, selection, siblings, topGap, onNavigate, onClose }: {
  snapshot: FavoritesSnapshot;
  contributors: FavoritesExportCell[];
  selection: FavoritesDrillDownSelection;
  siblings: FavoritesDrillDownSelection[];
  topGap: number;
  onNavigate: (selection: FavoritesDrillDownSelection) => void;
  onClose: () => void;
}) {
  const t = useT();
  const desktop = useViewportAtLeast(1024);
  const [details, setDetails] = useState<{ name: string; coordinates: SourceCoordinate[] } | null>(null);
  const [peek, setPeek] = useState(true);
  const assignedIds = useMemo(() => new Set(snapshot.cells.flatMap(cell => cell.mon ? [cell.mon.id] : [])), [snapshot]);
  const items = useMemo(() => {
    const validFills = Object.fromEntries(snapshot.cells.flatMap(cell => cell.mon ? [[cell.key, cell.mon.id]] : []));
    const item = (category: FavoritesDrillDownSelection): AnalyticsDrillDownItem => ({
      id: `${category.dimension}:${category.key}`,
      label: category.label,
      shape: category.dimension === 'shape' ? category.key as ShapeName : undefined,
      onSelect: () => { setDetails(null); onNavigate(category); },
      getData: () => {
        const cells = category.key === selection.key && category.dimension === selection.dimension ? contributors
          : pickerConditionalContributors(snapshot, category.dimension, category.key);
        const color = category.dimension === 'type' ? TYPE_COLORS[category.key as TypeName]
          : category.dimension === 'color' ? category.key === 'white' ? '#171717' : COLOR_BADGE_FILLS[category.key as ColorName] : '#ef4444';
        const data: DrillDownData = {
          title: category.dimension === 'type' ? t('drilldown.typeTitle', { type: category.label })
            : category.dimension === 'shape' ? t('drilldown.shapeTitle', { shape: category.label }) : category.label,
          subtitle: t('favorites.analytics.contributors', { count: cells.length }),
          color,
          icon: category.dimension === 'type' ? typeIconPath(category.key as TypeName) : undefined,
          shape: category.dimension === 'shape' ? category.key as ShapeName : undefined,
          headerContent: category.dimension === 'color' ? <span aria-hidden className="w-4 h-4 rounded-sm" style={{ backgroundColor: COLOR_BADGE_FILLS[category.key as ColorName], border: category.key === 'white' ? '1px solid #a3a3a3' : undefined }} />
            : category.dimension === 'evolution' ? <svg aria-hidden width="24" height="16" viewBox="0 0 57 27">{evolutionDotsSvg(category.key as EvolutionRole)}</svg> : undefined,
          sections: GEN_AXIS.filter(row => row !== 'favorite').flatMap(row => {
            const groups = cells.filter(cell => cell.generation === row).flatMap(cell => {
              if (!cell.mon) return [];
              const mon = cell.mon;
              const pokemon = pickerPokemonMetadata(mon);
              if (!pokemon) return [];
              const linked = new Set([cell.key]);
              const coordinates: SourceCoordinate[] = [{ type: cell.type, gen: cell.generation,
                mark: isGenNumber(cell.generation) ? { source: 'gen', value: cell.generation } : { source: 'gimmick' } }];
              for (const pointer of snapshot.cells) {
                if (pointer.kind !== 'pointer' || pointer.mon?.id !== mon.id) continue;
                const sources = pointerCoordinates(pointer.type, pointer.generation, validFills, mon.id);
                if (!sources.some(source => linked.has(`${source.type}|${source.gen}`))) continue;
                linked.add(pointer.key);
                coordinates.push({ type: pointer.type, gen: pointer.generation, mark: { source: 'gimmick' } });
              }
              return [{ key: cell.key, members: [pokemon], matchedIds: new Set([mon.id]),
                tileAttributes: { 'data-contributor-cell': cell.key },
                tileTestId: `favorites-pick-${mon.id}`, displayLabel: pickerLabelOf(mon),
                onSelect: () => setDetails({ name: labelOf(mon), coordinates }),
                tileOverlay: (_: Pokemon, spritePx: number) => <CoordinatePills origins={coordinates} spritePx={spritePx} inset={spritePx * 0.03} markPx={spritePx * 0.28} pointer={false}
                  drilldown={{ gen: row, type: category.dimension === 'type' ? category.key as TypeName : undefined }} /> }];
            });
            return groups.length ? [{ sectionId: String(row), sectionName: isGenNumber(row) ? t('favorites.generation', { gen: ROMAN[row] }) : t(`favorites.axis.${row}`), sectionColor: color, attributes: { 'data-contributor-row': String(row) }, groups }] : [];
          }),
          standaloneTiles: true,
          totalPokemon: cells.length,
          totalLines: cells.length,
          showGenBadges: false,
          emptyContent: details && category.key === selection.key ? <div className="px-1 py-2 text-xs border-b"><strong><PokemonNameText name={details.name} /></strong><p>{details.coordinates.map(origin => coordinateLabel(origin.type, origin.gen)).join('; ')}</p></div> : !cells.length ? <p className="text-sm text-muted-foreground py-4">{t('favorites.analytics.noContributors')}</p> : undefined,
        };
        return data;
      },
    });
    return { segment: item(selection), siblings: siblings.map(item) };
  }, [snapshot, contributors, selection, siblings, onNavigate, details, t]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [onClose]);
  const props = { ...items, assignedIds, closeDrillDown: onClose, peek, expandDrillDown: () => setPeek(false) };
  const attributes = { 'data-testid': 'favorites-drilldown', 'data-dimension': selection.dimension, 'data-category': selection.key };
  return desktop
    ? <div className="hidden md:flex w-1/2 flex-shrink-0 border-l"><AnalyticsDrillDownPanel panelAttributes={attributes} {...props} /></div>
    : <div className="absolute inset-x-0 bottom-0 h-full pointer-events-none"><AnalyticsDrillDownSheet panelAttributes={attributes} {...props} topGap={topGap} /></div>;
}
