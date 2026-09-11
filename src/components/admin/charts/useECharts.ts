import { useEffect, useRef } from 'react';
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
): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  // Keep the latest builder without re-subscribing the ResizeObserver each
  // render. Assigned in an effect (not during render), and this effect is
  // declared first so it runs before the init effect on mount.
  const buildRef = useRef(build);
  useEffect(() => {
    buildRef.current = build;
  });

  useEffect(() => {
    const el = ref.current;
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
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  // Redraw when the caller's data changes. `deps` is the caller's own list, so
  // it cannot be an array literal here — that's the design of the hook.
  useEffect(() => {
    const chart = chartRef.current;
    const el = ref.current;
    if (!chart || !el) return;
    chart.setOption(buildRef.current(el), true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return ref;
}
