import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { t, tn, useLocale } from '@/i18n';
import { type DrillDownSegment } from '@/store/usePokedexStore';
import { getPokemonByIds, getEvolutionLine, withoutSpecials } from '@/hooks/usePokemonData';

const STAGE_COLORS = ['#f5a3a3', '#e56060', '#dc2626'];
const STAGE_LINE_COLORS = ['#e88a8a', '#d95050', '#b91c1c'];
const STAGE_NAME_KEYS = ['stage.lineLength.1', 'stage.lineLength.2', 'stage.lineLength.3'] as const;
const stageNames = () => STAGE_NAME_KEYS.map((k) => t(k));

type DrillToggle = (
  segment: DrillDownSegment,
  siblings?: DrillDownSegment[],
  excludeFlag?: boolean,
  dexId?: string | null,
  newOnly?: boolean,
) => void;

interface StageDistributionChartProps {
  sections: Record<string, number[]>;
  drillDownSegment: DrillDownSegment | null;
  onDrillToggle: DrillToggle;
}

function StageDistributionChartImpl({ sections, drillDownSegment, onDrillToggle }: StageDistributionChartProps) {
  useLocale();
  const [excludeSpecialMekko, setExcludeSpecialMekko] = useState(false);

  const mekkoRef = useRef<HTMLDivElement>(null);
  const [mekkoWidth, setMekkoWidth] = useState(0);
  useEffect(() => {
    if (!mekkoRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0) setMekkoWidth((prev) => (Math.abs(prev - w) < 0.5 ? prev : w));
    });
    ro.observe(mekkoRef.current);
    return () => ro.disconnect();
  }, []);
  const mekkoScale = mekkoWidth > 0 ? Math.max(1, Math.min(mekkoWidth / 360, 2)) : 1;

  const fixedMaxColTotal = useMemo(() => {
    const allIdSet = new Set(Object.values(sections).flat());
    const starterSectionIds = new Set(sections['starter'] ?? []);
    const allPokemon = getPokemonByIds(allIdSet);
    const filteredPokemon = withoutSpecials(allPokemon, starterSectionIds);

    const getMaxCol = (pokemon: typeof allPokemon) => {
      const counts: Record<number, number> = {};
      for (const p of pokemon) {
        const lineLen = Math.min(getEvolutionLine(p.id).length, 3);
        counts[lineLen] = (counts[lineLen] || 0) + 1;
      }
      return Math.max(...Object.values(counts), 0);
    };

    return Math.max(getMaxCol(allPokemon), getMaxCol(filteredPokemon));
  }, [sections]);

  const mekkoData = useMemo(() => {
    const allIdSet = new Set(Object.values(sections).flat());
    const starterSectionIds = new Set(sections['starter'] ?? []);
    let pokemon = getPokemonByIds(allIdSet);
    if (excludeSpecialMekko) {
      pokemon = withoutSpecials(pokemon, starterSectionIds);
    }

    const stageCountsByLineLength: Record<number, Record<number, number>> = {};
    const chainsPerLength: Record<number, Set<string>> = {};

    for (const p of pokemon) {
      const line = getEvolutionLine(p.id);
      const lineLen = Math.min(line.length, 3);
      const stage = Math.min(p.evolutionStage, 3);
      const branchKey = `${line[0].id}`;

      if (!stageCountsByLineLength[lineLen]) stageCountsByLineLength[lineLen] = {};
      stageCountsByLineLength[lineLen][stage] = (stageCountsByLineLength[lineLen][stage] || 0) + 1;

      if (!chainsPerLength[lineLen]) chainsPerLength[lineLen] = new Set();
      chainsPerLength[lineLen].add(branchKey);
    }

    const allBranches = new Set(pokemon.map(p => `${getEvolutionLine(p.id)[0].id}`));
    const totalChains = allBranches.size;
    const columns: { lineLength: number; chainCount: number; widthPct: number; segments: { stage: number; count: number }[] }[] = [];
    for (const len of [1, 2, 3]) {
      const chainCount = chainsPerLength[len]?.size || 0;
      if (chainCount === 0) continue;
      const widthPct = (chainCount / totalChains) * 100;
      const segments: { stage: number; count: number }[] = [];
      for (let s = 1; s <= len; s++) {
        segments.push({ stage: s, count: stageCountsByLineLength[len]?.[s] || 0 });
      }
      columns.push({ lineLength: len, chainCount, widthPct, segments });
    }

    return { columns, totalLines: totalChains };
  }, [sections, excludeSpecialMekko]);

  return (
    <section>
      <h3 className="text-lg font-semibold mb-1">{t('stage.heading')}</h3>
      <p className="text-sm text-muted-foreground mb-2">
        {t('stage.desc')}
      </p>
      <div className="flex items-center gap-1.5 mb-3">
        <button type="button"
          onClick={() => setExcludeSpecialMekko(!excludeSpecialMekko)}
          className={`px-2.5 py-1 rounded-full text-[0.6875rem] font-medium whitespace-nowrap transition-colors ${
            excludeSpecialMekko
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
        >
          {t('analytics.excludeSpecial')}
        </button>
      </div>
      <div ref={mekkoRef} className="bg-card rounded-lg shadow-elevated p-4">
        {mekkoData.totalLines > 0 ? (() => {
          const chartHeight = 180 * mekkoScale;
          const topMargin = 20 * mekkoScale;
          const gap = 8;
          const MIN_SEG = 0;
          const stageTotals: Record<number, number> = {};
          for (const col of mekkoData.columns) {
            for (const seg of col.segments) {
              stageTotals[seg.stage] = (stageTotals[seg.stage] || 0) + seg.count;
            }
          }
          const names = stageNames();
          const allColumns = [1, 2, 3].map(len => {
            const existing = mekkoData.columns.find(c => c.lineLength === len);
            return existing || { lineLength: len, chainCount: 0, widthPct: 0, segments: [] as { stage: number; count: number }[] };
          });

          const computeSegHeights = (segments: { stage: number; count: number }[]) => {
            const colTotal = segments.reduce((s, seg) => s + seg.count, 0);
            const colHeight = fixedMaxColTotal > 0 ? (colTotal / fixedMaxColTotal) * chartHeight : 0;
            return segments.map(seg => {
              if (seg.count === 0) return 0;
              const natural = colTotal > 0 ? (seg.count / colTotal) * colHeight : 0;
              return Math.max(natural, MIN_SEG);
            });
          };
          const columnSegHeights = allColumns.map(col => computeSegHeights(col.segments));

          const legendIdx = allColumns[2].segments.length > 0 ? 2
            : allColumns[1].segments.length > 0 ? 1 : 0;
          const legendCol = allColumns[legendIdx];
          const legendSegHeights = columnSegHeights[legendIdx];

          const legendStages = [3, 2, 1].filter(s => stageTotals[s]);
          const isFirstLegend = (s: number) => s === legendStages[0];

          const containerH = chartHeight + topMargin;

          const activeSegs = legendCol.segments
            .map((seg, idx) => ({ stage: seg.stage, count: seg.count, height: legendSegHeights[idx] }))
            .filter(s => s.count > 0);
          let legendYAccum = 0;
          const segCentersFromBottom = activeSegs.map(s => {
            const center = legendYAccum + s.height / 2;
            legendYAccum += s.height;
            return center;
          });
          const LEGEND_LABEL_H = 34 * mekkoScale;
          const LEGEND_LABEL_H_FIRST = 46 * mekkoScale;
          const legendLabelHeights = activeSegs.map((seg) =>
            isFirstLegend(seg.stage) ? LEGEND_LABEL_H_FIRST : LEGEND_LABEL_H
          );
          const LEGEND_GAP = 4;

          const minSpacings = activeSegs.slice(1).map((_, i) =>
            (legendLabelHeights[i] + legendLabelHeights[i + 1]) / 2 + LEGEND_GAP
          );
          const labelCentersFromBottom = [...segCentersFromBottom];
          const needsRedistribution = minSpacings.some((minSp, i) =>
            segCentersFromBottom[i + 1] - segCentersFromBottom[i] < minSp
          );
          if (needsRedistribution && labelCentersFromBottom.length > 1) {
            const totalNeeded = legendLabelHeights.reduce((a, b) => a + b, 0) + LEGEND_GAP * (legendLabelHeights.length - 1);
            const origMid = (segCentersFromBottom[0] + segCentersFromBottom[segCentersFromBottom.length - 1]) / 2;
            let startCenter = origMid - totalNeeded / 2 + legendLabelHeights[0] / 2;
            if (startCenter - legendLabelHeights[0] / 2 < 0) startCenter = legendLabelHeights[0] / 2;
            let acc = startCenter;
            for (let i = 0; i < labelCentersFromBottom.length; i++) {
              labelCentersFromBottom[i] = acc;
              if (i < labelCentersFromBottom.length - 1) {
                acc += (legendLabelHeights[i] + legendLabelHeights[i + 1]) / 2 + LEGEND_GAP;
              }
            }
          }
          const anyDisplaced = labelCentersFromBottom.some((y, i) =>
            Math.abs(y - segCentersFromBottom[i]) > 1
          );

          return (
            <div className="flex">
              <div className="flex-1 min-w-0">
                <div className="flex items-end" style={{ height: containerH, gap }}>
                  {allColumns.map((col, colIdx) => {
                    const colTotal = col.segments.reduce((s, seg) => s + seg.count, 0);
                    const segHeights = columnSegHeights[colIdx];

                    const LABEL_FONT = 10 * mekkoScale;
                    const LABEL_FIT = 14 * mekkoScale;
                    const PILL_H = 12 * mekkoScale;

                    let yAcc = 0;
                    const segGeo = col.segments.map((seg, segIdx) => {
                      const h = segHeights[segIdx];
                      const center = yAcc + h / 2;
                      yAcc += h;
                      return { stage: seg.stage, count: seg.count, h, center };
                    }).filter(s => s.count > 0);
                    const colHeight = yAcc;

                    const X_SLOTS = [50, 25, 75];
                    const Y_NUDGES = [0, -8, 8, -16, 16];

                    type Placed = { stage: number; count: number; xPct: number; y: number; inside: boolean };
                    const placedLabels: Placed[] = [];

                    const overlapsPlaced = (xPct: number, y: number) =>
                      placedLabels.some(p =>
                        Math.abs(p.y - y) < PILL_H && Math.abs(p.xPct - xPct) < 20
                      );

                    for (const s of segGeo) {
                      if (s.h >= LABEL_FIT && !overlapsPlaced(50, s.center)) {
                        placedLabels.push({ stage: s.stage, count: s.count, xPct: 50, y: s.center, inside: true });
                        continue;
                      }
                      let placed = false;
                      for (const dy of Y_NUDGES) {
                        for (const xPct of X_SLOTS) {
                          const candY = s.center + dy;
                          if (!overlapsPlaced(xPct, candY)) {
                            placedLabels.push({ stage: s.stage, count: s.count, xPct, y: candY, inside: false });
                            placed = true;
                            break;
                          }
                        }
                        if (placed) break;
                      }
                      if (!placed) {
                        placedLabels.push({ stage: s.stage, count: s.count, xPct: 50, y: s.center, inside: false });
                      }
                    }

                    const isColumnActive = drillDownSegment?.kind === 'lineLength' &&
                      drillDownSegment.lineLength === col.lineLength;

                    return (
                      <div
                        key={col.lineLength}
                        className="flex-1 flex flex-col justify-end"
                        style={{ height: '100%' }}
                      >
                        {colTotal > 0 && (
                          <>
                            <div className="text-center text-xs text-muted-foreground font-bold mb-0.5 leading-tight flex items-end justify-center tabular-nums" style={{ height: 26 * mekkoScale }}>
                              <span>{colIdx === 0 ? tn('stage.columnTotal', colTotal) : colTotal}</span>
                            </div>
                            <div className="relative" style={{
                              borderRadius: 3,
                              boxShadow: isColumnActive ? `0 0 0 3.5px ${STAGE_LINE_COLORS[col.lineLength - 1]}ab` : undefined,
                            }}>
                              <div className="flex flex-col-reverse" style={{ borderRadius: 3, overflow: 'hidden' }}>
                                {col.segments.map((seg, segIdx) => {
                                  return (
                                    <div
                                      key={seg.stage}
                                      className={seg.count > 0 ? 'cursor-pointer hover:brightness-110 transition-[filter]' : ''}
                                      style={{
                                        height: segHeights[segIdx],
                                        backgroundColor: STAGE_COLORS[seg.stage - 1],
                                      }}
                                      onClick={seg.count > 0 ? () => onDrillToggle({ kind: 'stage', lineLength: col.lineLength, stage: seg.stage }, undefined, excludeSpecialMekko) : undefined}
                                    />
                                  );
                                })}
                              </div>
                              {(() => {
                                let activeStage: number | null = null;
                                for (const seg of col.segments) {
                                  const isSeg = drillDownSegment?.kind === 'stage' &&
                                    drillDownSegment.lineLength === col.lineLength &&
                                    drillDownSegment.stage === seg.stage;
                                  const isAll = drillDownSegment?.kind === 'stageAll' &&
                                    drillDownSegment.stage === seg.stage;
                                  if ((isSeg || isAll) && seg.count > 0) { activeStage = seg.stage; break; }
                                }
                                if (activeStage === null) return null;
                                let bottom = 0;
                                let height = 0;
                                for (let i = 0; i < col.segments.length; i++) {
                                  const h = segHeights[i];
                                  if (col.segments[i].stage === activeStage) { height = h; break; }
                                  bottom += h;
                                }
                                return (
                                  <div
                                    className="absolute inset-x-0 pointer-events-none"
                                    style={{
                                      bottom,
                                      height,
                                      boxShadow: `0 0 0 3.5px ${STAGE_COLORS[activeStage - 1]}ab`,
                                      borderRadius: 2,
                                      zIndex: 5,
                                    }}
                                  />
                                );
                              })()}
                              <svg
                                className="absolute top-0 left-0 overflow-visible pointer-events-none"
                                style={{ width: '100%', height: colHeight || 1 }}
                              >
                                {placedLabels.map(label => {
                                  const labelY = colHeight - label.y;
                                  if (label.inside) {
                                    return (
                                      <text
                                        key={label.stage}
                                        x={`${label.xPct}%`} y={labelY}
                                        textAnchor="middle" dominantBaseline="central"
                                        fill="white" fontSize={LABEL_FONT} fontWeight={600}
                                      >
                                        {label.count}
                                      </text>
                                    );
                                  }
                                  const bgColor = STAGE_COLORS[label.stage - 1];
                                  const pillW = (String(label.count).length * 7 + 6) * mekkoScale;
                                  const pillH = 12 * mekkoScale;
                                  return (
                                    <g key={label.stage}>
                                      <rect
                                        x={`calc(${label.xPct}% - ${pillW / 2}px)`}
                                        y={labelY - pillH / 2}
                                        width={pillW} height={pillH}
                                        rx={3}
                                        fill={bgColor}
                                      />
                                      <text
                                        x={`${label.xPct}%`} y={labelY}
                                        textAnchor="middle" dominantBaseline="central"
                                        fill="white" fontSize={LABEL_FONT} fontWeight={600}
                                      >
                                        {label.count}
                                      </text>
                                    </g>
                                  );
                                })}
                              </svg>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="flex mt-1" style={{ gap }}>
                  {allColumns.map((col, idx) => {
                    const isXActive = drillDownSegment?.kind === 'lineLength' && drillDownSegment.lineLength === col.lineLength;
                    return (
                      <div
                        key={col.lineLength}
                        className="flex-1 text-center text-xs text-muted-foreground font-bold leading-tight tabular-nums cursor-pointer"
                        style={{ height: 38 * mekkoScale, textDecoration: isXActive ? 'underline' : undefined, textDecorationColor: isXActive ? STAGE_LINE_COLORS[col.lineLength - 1] : undefined }}
                        onClick={() => col.chainCount > 0 && onDrillToggle({ kind: 'lineLength', lineLength: col.lineLength }, undefined, excludeSpecialMekko)}
                      >
                        <span className="whitespace-nowrap" style={{ color: STAGE_LINE_COLORS[col.lineLength - 1] }}>{names[col.lineLength - 1]}</span>
                        <br />
                        {idx === 0 ? tn('stage.columnLines', col.chainCount) : col.chainCount}
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="relative shrink-0" style={{ height: containerH, marginLeft: 8 * mekkoScale, width: 56 * mekkoScale }}>
                {anyDisplaced && (
                  <svg className="absolute inset-0 overflow-visible pointer-events-none" style={{ width: 16 * mekkoScale, height: containerH }}>
                    {activeSegs.map((seg, i) => {
                      const segY = containerH - segCentersFromBottom[i];
                      const labelY = containerH - labelCentersFromBottom[i];
                      const lw = 16 * mekkoScale;
                      const mid = 8 * mekkoScale;
                      return (
                        <path
                          key={seg.stage}
                          d={`M0,${segY} C${mid},${segY} ${mid},${labelY} ${lw},${labelY}`}
                          fill="none"
                          stroke={STAGE_COLORS[seg.stage - 1]}
                          strokeWidth={1.5}
                          opacity={0.5}
                        />
                      );
                    })}
                  </svg>
                )}
                {activeSegs.map((seg, i) => {
                  const bottomPos = labelCentersFromBottom[i] - legendLabelHeights[i] / 2;
                  const isLegendActive = drillDownSegment?.kind === 'stageAll' && drillDownSegment.stage === seg.stage;
                  return (
                    <div
                      key={seg.stage}
                      className="absolute text-xs whitespace-nowrap leading-tight flex items-center tabular-nums cursor-pointer"
                      style={{
                        bottom: bottomPos,
                        height: legendLabelHeights[i],
                        left: anyDisplaced ? 18 * mekkoScale : 0,
                      }}
                      onClick={() => onDrillToggle({ kind: 'stageAll', stage: seg.stage }, undefined, excludeSpecialMekko)}
                    >
                      <span className="text-muted-foreground font-bold" style={isLegendActive ? { textDecoration: 'underline', textDecorationColor: STAGE_COLORS[seg.stage - 1] } : undefined}>
                        <span style={{ color: STAGE_COLORS[seg.stage - 1] }}>{t('stage.label', { stage: seg.stage })}</span>
                        {isFirstLegend(seg.stage) && <><br />{t('stage.legendUnit')}</>}
                        <br />
                        {stageTotals[seg.stage]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })() : (
          <p className="text-sm text-muted-foreground text-center py-4">{t('stage.empty')}</p>
        )}
      </div>
    </section>
  );
}

export const StageDistributionChart = memo(StageDistributionChartImpl);
