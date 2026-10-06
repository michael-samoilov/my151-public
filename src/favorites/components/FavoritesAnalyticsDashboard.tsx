import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ButterflyChart, type ButterflyRow } from '@/components/analytics/ButterflyChart';
import { PickerBstHistogram } from './PickerBstHistogram';
import { FavoritesDrillDown, type FavoritesDrillDownSelection } from './FavoritesDrillDown';
import { colorChartIcon, shapeBadgeChartIcon, evolutionChartIcon } from '@/components/shared/attributeBadgeSvg';
import { typeChartIcon } from '@/components/shared/typeBadgeSvg';
import type { EvolutionRole } from '@/lib/attributeBadgeStyle';
import { COLOR_BADGE_FILLS } from '@/lib/attributeBadgeStyle';
import { TYPE_COLORS } from '@/data/type-colors';
import { colorLabel, formatNumber, localeUppercase, shapeLabel, typeLabel, useT } from '@/i18n';
import { MAX_LABEL_STRETCH, measureLabelWidth } from '@/lib/sectionOutlines';
import type { ColorName, ShapeName, TypeName } from '@/types/pokemon';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { pickerConditionalStats, pickerConditionalContributors, type PickerConditionalStats } from '../stats/pickerConditionalStats';
import { pickerIndexDomain } from '../stats/pickerIndexDomain';

type Dimension = 'type' | 'color' | 'shape' | 'evolution';
type Sort = 'count' | 'deviation' | 'label';
const TEXT = 'text-xs';
/** Match the Dex detailed-stats title without changing the shared Dex panel. */
function ChartTitle({ text }: { text: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [stretch, setStretch] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = measureLabelWidth(localeUppercase(text), parseFloat(getComputedStyle(el).fontSize) || 14);
      if (width > 0 && el.clientWidth > 0) setStretch(Math.min(MAX_LABEL_STRETCH, el.clientWidth / width));
    };
    let active = true;
    measure();
    void document.fonts.ready.then(() => { if (active) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { active = false; observer.disconnect(); };
  }, [text]);
  return <h2 ref={ref} className="text-sm mb-1 overflow-hidden"><span className="inline-block font-black uppercase leading-none whitespace-nowrap origin-left" style={{ transform: `scaleX(${stretch})` }}>{text}</span></h2>;
}

function Card({ dimension, title, covered, excluded, children }: { dimension: string; title: string; covered: number; excluded: number; children: ReactNode }) {
  return <section data-favorite-chart={dimension} data-favorite-covered={covered} data-favorite-excluded={excluded} aria-label={title} className="relative bg-card rounded-lg shadow-elevated py-3 px-4 sm:px-5 min-w-0">
    <ChartTitle text={title} />
    {children}
  </section>;
}

function Distribution({ dimension, stats, onOpen, activeKey }: { dimension: Dimension; stats: PickerConditionalStats; onOpen: (selection: FavoritesDrillDownSelection, siblings: FavoritesDrillDownSelection[]) => void; activeKey?: string }) {
  const t = useT();
  const [sort, setSort] = useState<Sort>('deviation');
  const data = stats.dimensions[dimension];
  const roles: Record<string, string> = { basic: t('favorites.stats.basic'), intermediate: t('favorites.stats.middle'), final: t('favorites.stats.final'), standalone: t('favorites.stats.noEvo') };
  const label = (key: string) => dimension === 'type' ? typeLabel(key as TypeName) : dimension === 'shape' ? shapeLabel(key as ShapeName) : dimension === 'color' ? colorLabel(key as ColorName) : roles[key];
  const rows: (ButterflyRow & { expected: number })[] = data.rows.flatMap(row => {
    const name = label(row.key);
    let icon: ButterflyRow['icon'];
    if (dimension === 'shape') {
      const render = shapeBadgeChartIcon(row.key as ShapeName);
      icon = (x, y, size, width) => <g><title>{name}</title>{render(x, y, size, width)}</g>;
    } else if (dimension === 'type') {
      icon = typeChartIcon(row.key as TypeName);
    } else if (dimension === 'color') {
      icon = colorChartIcon(row.key as ColorName);
    } else {
      icon = evolutionChartIcon(row.key as EvolutionRole);
    }
    return [{ key: row.key, label: name, count: row.count, expected: row.expected, deviation: row.deviation ?? 0, unavailable: row.deviation === null, color: dimension === 'type' ? TYPE_COLORS[row.key as TypeName] : dimension === 'color' ? COLOR_BADGE_FILLS[row.key as ColorName] : '#dc2626', barOpacity: dimension === 'type' || dimension === 'color' ? 1 : undefined, barStroke: dimension === 'color' && row.key === 'white' ? '#a3a3a3' : undefined, icon }];
  }).sort((a, b) => Number(a.unavailable) - Number(b.unavailable) || (sort === 'label' ? a.label.localeCompare(b.label) : (sort === 'count' ? b.count - a.count : b.deviation - a.deviation) || a.label.localeCompare(b.label)));
  const titles = { type: t('stats.type.title'), shape: t('favorites.stats.shape'), color: t('favorites.stats.color'), evolution: t('favorites.stats.evolution') };
  const labelHeader = dimension === 'type' ? t('chart.header.type') : dimension === 'shape' ? t('chart.header.shape') : dimension === 'color' ? t('chart.header.color') : undefined;
  return <Card dimension={dimension} covered={data.coveredChoices} excluded={data.excludedChoices} title={titles[dimension]}>
    {rows.some(row => row.unavailable) && <p className="text-xs text-muted-foreground mb-2">{t('favorites.stats.unavailable')}</p>}
    <>
      <ButterflyChart data={rows} fixedIndexDomain={pickerIndexDomain(rows)} activeKey={activeKey} onBarClick={key => { const siblings = rows.map(row => ({ dimension, key: row.key!, label: row.label })); const selected = siblings.find(row => row.key === key); if (selected) onOpen(selected, siblings); }} rowHeight={22} hideLabelText alignBaselines iconFillsRow sortBy={sort} onSortChange={setSort} labelHeader={labelHeader} textClass={TEXT} />
      <div className="sr-only" data-audit-clip="intended"><table><caption>{titles[dimension]}</caption><thead><tr><th>{titles[dimension]}</th><th>{t('chart.header.count')}</th><th>{t('favorites.stats.options')}</th><th>{t('chart.header.overIndexed2')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.key} data-favorite-chart-row={row.key}><th>{row.label}</th><td>{formatNumber(row.count)}</td><td>{formatNumber(row.expected, { maximumFractionDigits: 4 })}</td><td>{row.unavailable ? t('favorites.stats.unavailable') : `${formatNumber(1 + row.deviation / 100, { maximumFractionDigits: 2 })}×`}</td></tr>)}</tbody></table></div>
    </>
  </Card>;
}

/** Live choices use the same validated selector-option baseline as the Full export. */
export default function FavoritesAnalyticsDashboard({ fills, active = true }: { fills: Readonly<Record<string, number>>; active?: boolean }) {
  const t = useT();
  const snapshot = useMemo(() => buildFavoritesSnapshot(fills), [fills]);
  const stats = useMemo(() => pickerConditionalStats(snapshot), [snapshot]);
  const [drilldown, setDrilldown] = useState<{ selection: FavoritesDrillDownSelection; siblings: FavoritesDrillDownSelection[] } | null>(null);
  const trigger = useRef<HTMLElement | SVGElement | null>(null);
  const closeDrilldown = () => { setDrilldown(null); trigger.current?.focus(); };
  if (!active && drilldown) setDrilldown(null);
  const openDrilldown = (selection: FavoritesDrillDownSelection, siblings: FavoritesDrillDownSelection[]) => {
    trigger.current = document.activeElement instanceof HTMLElement || document.activeElement instanceof SVGElement ? document.activeElement : null;
    setDrilldown({ selection, siblings });
  };
  const coverage = stats.dimensions.bst.coveredChoices;
  return <div className="relative h-full min-h-0"><div data-favorites-analytics data-testid="favorites-analytics" data-favorite-population={stats.populationSize} className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
    <div className="max-w-6xl md:max-w-2xl mx-auto p-4 sm:p-6">
      {!stats.populationSize && <p className="text-sm text-muted-foreground mb-5">{t('favorites.analytics.empty')}</p>}
      <div className="space-y-4 sm:space-y-6 md:space-y-8 min-w-0">
        <Distribution dimension="type" stats={stats} onOpen={openDrilldown} activeKey={drilldown?.selection.dimension === 'type' ? drilldown.selection.key : undefined} />
        <Distribution dimension="color" stats={stats} onOpen={openDrilldown} activeKey={drilldown?.selection.dimension === 'color' ? drilldown.selection.key : undefined} />
        <Distribution dimension="shape" stats={stats} onOpen={openDrilldown} activeKey={drilldown?.selection.dimension === 'shape' ? drilldown.selection.key : undefined} />
        <Distribution dimension="evolution" stats={stats} onOpen={openDrilldown} activeKey={drilldown?.selection.dimension === 'evolution' ? drilldown.selection.key : undefined} />
        <Card dimension="bst" covered={coverage} excluded={stats.dimensions.bst.excludedChoices} title={t('stats.bst.title')}>
          <p className="text-xs text-muted-foreground mb-2">{t('favorites.stats.bstScope')}</p>
          {stats.incomplete && <p className="text-xs text-muted-foreground mb-2">{t('favorites.stats.selectedOptions')}</p>}
          {coverage ? <>
            <PickerBstHistogram bst={stats.bst} activeBin={drilldown?.selection.dimension === 'bst' ? Number(drilldown.selection.key) + stats.bst.binSize / 2 : undefined} onBinClick={start => {
              const siblings = stats.bst.merged.map(bin => ({ dimension: 'bst' as const, key: String(bin.x - stats.bst.binSize / 2), label: t('drilldown.bstTitle', { from: bin.x - stats.bst.binSize / 2, to: bin.x + stats.bst.binSize / 2 - 1 }) }));
              const selected = siblings.find(bin => Number(bin.key) === start);
              if (selected) openDrilldown(selected, siblings);
            }} />
          </> : <p className="text-sm text-muted-foreground py-4">{t('favorites.stats.empty')}</p>}
        </Card>
      </div>
    </div>
  </div>
    {drilldown && active && <FavoritesDrillDown snapshot={snapshot} selection={drilldown.selection} siblings={drilldown.siblings}
      contributors={pickerConditionalContributors(snapshot, drilldown.selection.dimension, drilldown.selection.key)}
      onNavigate={selection => setDrilldown({ ...drilldown, selection })} onClose={closeDrilldown} />}
  </div>;
}
