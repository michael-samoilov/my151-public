import { useCallback, useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, SankeyChart, BarChart, CustomChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';

// Tree-shaken registration: only the chart types and components the admin
// dashboard uses, so the admin bundle carries a fraction of full echarts. The
// admin page is lazy-loaded (src/home/main.tsx), so this never reaches the hub.
echarts.use([
  LineChart,
  SankeyChart,
  BarChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
  CanvasRenderer,
]);

export { echarts };
export type EChartsOption = EChartsCoreOption;

/** A light, confined tooltip shared by the admin charts. Surface background
 *  with a hairline border and soft shadow — never a large black box, and
 *  `confine` keeps it inside the chart so it can't cover the cards beneath. */
export function tooltipStyle(el: HTMLElement | null) {
  return {
    confine: true,
    backgroundColor: cssVar(el, '--color-card', '#ffffff'),
    borderColor: cssVar(el, '--color-border', '#e5e5e5'),
    borderWidth: 1,
    padding: [6, 8] as [number, number],
    textStyle: { color: cssVar(el, '--color-foreground', '#0a0a0a'), fontSize: 11 },
    extraCssText: 'border-radius:8px;box-shadow:0 4px 14px rgba(9,9,15,0.10);',
  };
}

/** Read a CSS custom property off an element, trimmed. Charts pull their colors
 *  from the app's design tokens so they track the theme instead of hardcoding
 *  hex values. Falls back to the given default when the property is unset. */
export function cssVar(el: HTMLElement | null, name: string, fallback = ''): string {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

/**
 * Mount an echarts instance on a div and keep its option in sync.
 *
 * Returns a ref to attach to the chart container. The container must have a
 * height (echarts measures its box), so callers set one. The option is rebuilt
 * by `build`, which receives the live container so it can read design tokens;
 * pass the values it depends on in `deps` so the chart redraws when they change.
 * A ResizeObserver keeps the chart sized to its container — the same
 * container-relative scaling the rest of the dashboard uses.
 */
export function useECharts(
  build: (el: HTMLDivElement) => EChartsOption,
  deps: unknown[],
): (el: HTMLDivElement | null) => void {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  // Keep the latest builder without re-subscribing anything each render.
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  // A callback ref, so the instance follows the DOM node. A conditional render
  // (a "not enough data" fallback, or a hidden tab) detaches the node and then
  // re-attaches a fresh one; init and dispose must track that, or the chart
  // binds to a stale, detached node and paints nothing after the node returns.
  const setNode = useCallback((el: HTMLDivElement | null) => {
    if (el === elRef.current) return;
    if (chartRef.current) {
      roRef.current?.disconnect();
      roRef.current = null;
      chartRef.current.dispose();
      chartRef.current = null;
    }
    elRef.current = el;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    chart.setOption(buildRef.current(el), true);
    const ro = new ResizeObserver(() => {
      chart.resize();
      // Re-run the builder on resize so geometry that scales with width
      // (label cadence, insets) recomputes, mirroring the mockup's chartScale.
      chart.setOption(buildRef.current(el), true);
    });
    ro.observe(el);
    roRef.current = ro;
  }, []);

  // Redraw when the caller's data changes. `deps` is the caller's own list, so
  // it cannot be an array literal here — that's the design of the hook.
  useEffect(() => {
    const chart = chartRef.current;
    const el = elRef.current;
    if (!chart || !el) return;
    chart.setOption(buildRef.current(el), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return setNode;
}
