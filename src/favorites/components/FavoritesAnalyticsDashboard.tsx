import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ButterflyChart, type ButterflyRow } from '@/components/analytics/ButterflyChart';
import { SuperimposedHistogram } from '@/components/analytics/SuperimposedHistogram';
import { colorChartIcon, shapeBadgeChartIcon } from '@/components/shared/attributeBadgeSvg';
import { typeChartIcon } from '@/components/shared/typeBadgeSvg';
import { COLOR_BADGE_FILLS } from '@/lib/attributeBadgeStyle';
import { TYPE_COLORS } from '@/data/type-colors';
import { colorLabel, formatNumber, localeUppercase, shapeLabel, typeLabel, useT } from '@/i18n';
import { MAX_LABEL_STRETCH, measureLabelWidth } from '@/lib/sectionOutlines';
import type { ColorName, ShapeName, TypeName } from '@/types/pokemon';
import { buildFavoritesSnapshot } from '../export/snapshot';
import { pickerConditionalStats, type PickerConditionalStats } from '../stats/pickerConditionalStats';

type Dimension = 'type' | 'color' | 'shape' | 'evolution';
type Sort = 'count' | 'deviation' | 'label';
const TEXT = 'text-xs';
let roleMeasureCanvas: HTMLCanvasElement | undefined;
function roleLabelWidth(label: string): number {
  roleMeasureCanvas ??= document.createElement('canvas');
  const ctx = roleMeasureCanvas.getContext('2d');
  if (!ctx) return label.length * 7;
  ctx.font = '400 12px "Inter Variable", system-ui, sans-serif';
  return ctx.measureText(label).width;
}

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

function RoleGlyph({ role, x, y, size }: { role: string; x: number; y: number; size: number }) {
  const cy = y + size / 2;
  if (role === 'standalone') return <circle cx={x + size / 2} cy={cy} r={size * .12} fill="var(--color-primary)" stroke="var(--color-muted-foreground)" strokeWidth={.7} />;
  const filled = role === 'basic' ? 1 : role === 'intermediate' ? 2 : 3;
  return <g>{[0, 1, 2].map(index => <circle key={index} cx={x + size * (.15 + index * .35)} cy={cy} r={size * .12} fill={index < filled ? 'var(--color-primary)' : 'none'} stroke="var(--color-muted-foreground)" strokeWidth={.7} />)}</g>;
}

function Distribution({ dimension, stats }: { dimension: Dimension; stats: PickerConditionalStats }) {
  const t = useT();
  const [sort, setSort] = useState<Sort>('deviation');
  const data = stats.dimensions[dimension];
  const roles: Record<string, string> = { basic: t('favorites.stats.basic'), intermediate: t('favorites.stats.middle'), final: t('favorites.stats.final'), standalone: t('favorites.stats.noEvo') };
  const label = (key: string) => dimension === 'type' ? typeLabel(key as TypeName) : dimension === 'shape' ? shapeLabel(key as ShapeName) : dimension === 'color' ? colorLabel(key as ColorName) : roles[key];
  const rows: (ButterflyRow & { expected: number })[] = data.rows.flatMap(row => {
    // An unavailable index must never become an invented 1x reference.
    if (row.deviation === null) return [];
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
      icon = (x, y, size, width) => <g><title>{name}</title>
        <RoleGlyph role={row.key} x={x} y={y} size={size} />
        <text x={x + size + 5} y={y + size / 2} dominantBaseline="middle" className={TEXT} fill="currentColor" textLength={roleLabelWidth(name) > width - size - 8 ? width - size - 8 : undefined} lengthAdjust="spacingAndGlyphs">{name}</text>
      </g>;
    }
    return [{ key: row.key, label: name, count: row.count, expected: row.expected, deviation: row.deviation, color: dimension === 'type' ? TYPE_COLORS[row.key as TypeName] : dimension === 'color' ? COLOR_BADGE_FILLS[row.key as ColorName] : '#dc2626', barOpacity: dimension === 'type' || dimension === 'color' ? 1 : undefined, barStroke: dimension === 'color' && row.key === 'white' ? '#a3a3a3' : undefined, icon }];
  }).sort((a, b) => sort === 'label' ? a.label.localeCompare(b.label) : (sort === 'count' ? b.count - a.count : b.deviation - a.deviation) || a.label.localeCompare(b.label));
  const titles = { type: t('stats.type.title'), shape: t('favorites.stats.shape'), color: t('favorites.stats.color'), evolution: t('favorites.stats.evolution') };
  const labelHeader = dimension === 'type' ? t('chart.header.type') : dimension === 'shape' ? t('chart.header.shape') : dimension === 'color' ? t('chart.header.color') : undefined;
  return <Card dimension={dimension} covered={data.coveredChoices} excluded={data.excludedChoices} title={titles[dimension]}>
    {!data.coveredChoices ? <p className="text-sm text-muted-foreground py-4">{t('favorites.stats.empty')}</p> : <>
      <ButterflyChart data={rows} rowHeight={22} hideLabelText alignBaselines iconFillsRow sortBy={sort} onSortChange={setSort} labelHeader={labelHeader} textClass={TEXT} />
      <div className="sr-only" data-audit-clip="intended"><table><caption>{titles[dimension]}</caption><thead><tr><th>{titles[dimension]}</th><th>{t('chart.header.count')}</th><th>{t('favorites.stats.options')}</th><th>{t('chart.header.overIndexed2')}</th></tr></thead><tbody>{rows.map(row => <tr key={row.key} data-favorite-chart-row={row.key}><th>{row.label}</th><td>{formatNumber(row.count)}</td><td>{formatNumber(row.expected, { maximumFractionDigits: 4 })}</td><td>{formatNumber(1 + row.deviation / 100, { maximumFractionDigits: 2 })}×</td></tr>)}</tbody></table></div>
    </>}
  </Card>;
}

/** Keep BST tick labels readable without changing the shared histogram or its bins. */
function BstHistogram({ bst }: { bst: PickerConditionalStats['bst'] }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      if (next > 0) setWidth(previous => Math.abs(previous - next) < .5 ? previous : next);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.max(1, Math.min(width / 360, 2));
  const plotWidth = Math.max(1, width - 40 * scale - 12);
  const span = bst.xDomain[1] - bst.xDomain[0];
  const minimumTickGap = 32 * scale;
  const tickStep = bst.xTicks.length > 1 ? bst.xTicks[1] - bst.xTicks[0] : span;
  const stride = Math.max(1, Math.ceil(minimumTickGap * span / (plotWidth * tickStep)));
  const xTicks = bst.xTicks.filter((_, index) => index % stride === 0);
  return <div ref={ref}><SuperimposedHistogram data={bst.merged} binSize={bst.binSize} xDomain={bst.xDomain} xTicks={xTicks} yDomain={bst.yDomain} yTicks={bst.yTicks} textClass={TEXT} /></div>;
}

/** Live choices use the same validated selector-option baseline as the Full export. */
export default function FavoritesAnalyticsDashboard({ fills }: { fills: Readonly<Record<string, number>> }) {
  const t = useT();
  const stats = useMemo(() => pickerConditionalStats(buildFavoritesSnapshot(fills)), [fills]);
  const coverage = stats.dimensions.bst.coveredChoices;
  return <div data-favorites-analytics data-testid="favorites-analytics" data-favorite-population={stats.populationSize} className="h-full min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain">
    <div className="max-w-6xl md:max-w-2xl mx-auto p-4 sm:p-6">
      {!stats.populationSize && <p className="text-sm text-muted-foreground mb-5">{t('favorites.analytics.empty')}</p>}
      <div className="space-y-4 sm:space-y-6 md:space-y-8 min-w-0">
        <Distribution dimension="type" stats={stats} />
        <Distribution dimension="color" stats={stats} />
        <Distribution dimension="shape" stats={stats} />
        <Distribution dimension="evolution" stats={stats} />
        <Card dimension="bst" covered={coverage} excluded={stats.dimensions.bst.excludedChoices} title={t('stats.bst.title')}>
          {coverage ? <>
            <p className={`${TEXT} text-muted-foreground mb-3`}>{t('favorites.stats.means', { yours: formatNumber(stats.bst.yoursAvg, { maximumFractionDigits: 1 }), expected: formatNumber(stats.bst.nationalAvg, { maximumFractionDigits: 1 }) })}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-2">
              <span className={`${TEXT} text-muted-foreground inline-flex items-center gap-1.5`}><span aria-hidden className="w-3 h-3 rounded-sm bg-slate-400 opacity-50" />{t('favorites.stats.options')}</span>
              <span className={`${TEXT} text-muted-foreground inline-flex items-center gap-1.5`}><span aria-hidden className="w-3 h-3 rounded-sm bg-red-500 opacity-85" />{t('favorites.stats.yours')}</span>
            </div>
            <BstHistogram bst={stats.bst} />
          </> : <p className="text-sm text-muted-foreground py-4">{t('favorites.stats.empty')}</p>}
        </Card>
      </div>
    </div>
  </div>;
}
