import { useCallback, useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, SankeyChart, BarChart, CustomChart } from 'echarts/charts';
import {
  GridComponent,
  GraphicComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkAreaComponent,
  LegendComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { categoryIndexAtX, clampToRect, lineLeftInPlot, type PlotRect } from './scrubPlot';

// Tree-shaken registration: only the chart types and components the admin
// dashboard uses, so the admin bundle carries a fraction of full echarts. The
// admin page is lazy-loaded (src/home/main.tsx), so this never reaches the hub.
echarts.use([
  LineChart,
  SankeyChart,
  BarChart,
  CustomChart,
  GridComponent,
  GraphicComponent,
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
 * The one scrub every admin line chart shares. The x positions are evenly
 * spaced across the plot: index 0 at its left edge, `count - 1` at its right.
 * A hover shows the readout; a press adds the vertical line, and a drag keeps
 * both pinned to the plot edge. Release or leave hides them.
 */
export interface ChartScrub {
  count: number;
  /** HTML parts of the readout for one x position. The readout joins them
   *  with " · " and wraps only between parts when the chart is too narrow. */
  label: (index: number) => string[];
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
  opts: {
    scrub?: ChartScrub;
    afterRender?: (chart: echarts.ECharts, el: HTMLDivElement) => void;
  } = {},
): (el: HTMLDivElement | null) => void {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const scrubs = opts.scrub != null;
  // Keep the latest builder without re-subscribing anything each render.
  const buildRef = useRef(build);
  const afterRenderRef = useRef(opts.afterRender);
  const scrubRef = useRef(opts.scrub);
  useEffect(() => {
    buildRef.current = build;
    afterRenderRef.current = opts.afterRender;
    scrubRef.current = opts.scrub;
  });

  // A callback ref, so the instance follows the DOM node. A conditional render
  // (a "not enough data" fallback, or a hidden tab) detaches the node and then
  // re-attaches a fresh one; init and dispose must track that, or the chart
  // binds to a stale, detached node and paints nothing after the node returns.
  const setNode = useCallback((el: HTMLDivElement | null) => {
    if (el === elRef.current) return;
    if (chartRef.current) {
      cleanupRef.current?.();
      cleanupRef.current = null;
      roRef.current?.disconnect();
      roRef.current = null;
      chartRef.current.dispose();
      chartRef.current = null;
    }
    elRef.current = el;
    if (!el) return;
    const chart = echarts.init(el, undefined, { renderer: 'canvas' });
    chartRef.current = chart;
    const onFinished = () => {
      afterRenderRef.current?.(chart, el);
    };
    chart.on('finished', onFinished);
    chart.setOption(buildRef.current(el), true);
    const ro = new ResizeObserver(() => {
      chart.resize();
      // Re-run the builder on resize so geometry that scales with width
      // (label cadence, insets) recomputes, mirroring the mockup's chartScale.
      chart.setOption(buildRef.current(el), true);
    });
    ro.observe(el);
    roRef.current = ro;

    if (scrubs) {
      let pressed = false;

      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      // A drag scrubs the chart instead of scrolling the page.
      el.style.touchAction = 'none';
      const line = document.createElement('div');
      line.setAttribute('data-scrub-line', '1');
      line.style.cssText =
        'position:absolute;width:1px;top:0;bottom:0;pointer-events:none;display:none;z-index:1;';
      line.style.background = cssVar(el, '--color-muted-foreground', '#737373');
      line.style.opacity = '0.5';
      el.appendChild(line);
      const readout = document.createElement('div');
      readout.setAttribute('data-scrub-readout', '1');
      readout.style.cssText = [
        'position:absolute',
        'top:0',
        'left:0',
        'display:none',
        'z-index:2',
        'pointer-events:none',
        'width:max-content',
        'box-sizing:border-box',
        'max-width:100%',
        'border-radius:8px',
        'box-shadow:0 4px 14px rgba(9,9,15,0.10)',
        'padding:6px 8px',
        'font-size:11px',
        'line-height:1.2',
        `background:${cssVar(el, '--color-card', '#ffffff')}`,
        `border:1px solid ${cssVar(el, '--color-border', '#e5e5e5')}`,
        `color:${cssVar(el, '--color-foreground', '#0a0a0a')}`,
      ].join(';');
      el.appendChild(readout);

      // The plot rect, so the line spans the series band only, not the gutters.
      const gridRect = (): PlotRect | null => {
        try {
          // getModel is internal, so reach it through an untyped view.
          const model = (chart as unknown as { getModel(): { getComponent(t: string, i: number): unknown } }).getModel();
          const cs = (
            model.getComponent('grid', 0) as
              | { coordinateSystem?: { getRect?: () => PlotRect } }
              | undefined
          )?.coordinateSystem;
          const rect = cs?.getRect?.();
          if (!rect || rect.width <= 0 || rect.height <= 0) return null;
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
        } catch {
          return null;
        }
      };

      const placeReadout = (plot: PlotRect, pinnedX: number) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.count <= 0) {
          readout.style.display = 'none';
          return;
        }
        readout.innerHTML = scrub
          .label(categoryIndexAtX(pinnedX, plot, scrub.count - 1))
          .map((part) => `<span style="white-space:nowrap">${part}</span>`)
          .join(' · ');
        readout.style.display = 'block';
        const w = readout.offsetWidth;
        const maxX = Math.max(el.clientWidth - w, 0);
        readout.style.left = `${Math.max(0, Math.min(pinnedX - w / 2, maxX))}px`;
      };

      const showAt = (clientX: number, clientY: number) => {
        const r = el.getBoundingClientRect();
        const plot =
          gridRect() ?? {
            x: 1,
            y: 1,
            width: Math.max(r.width - 2, 1),
            height: Math.max(r.height - 2, 1),
          };
        const pinned = clampToRect(clientX - r.left, clientY - r.top, plot);
        placeReadout(plot, pinned.x);
        if (pressed) {
          line.style.left = `${lineLeftInPlot(pinned.x, plot)}px`;
          line.style.top = `${plot.y}px`;
          line.style.height = `${plot.height}px`;
          line.style.bottom = 'auto';
          line.style.display = 'block';
        } else {
          line.style.display = 'none';
        }
      };
      const hide = () => {
        line.style.display = 'none';
        readout.style.display = 'none';
      };
      const onDown = (e: PointerEvent) => {
        pressed = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        showAt(e.clientX, e.clientY);
      };
      const onMove = (e: PointerEvent) => {
        showAt(e.clientX, e.clientY);
        if (pressed) e.preventDefault();
      };
      const onLeave = () => {
        if (!pressed) hide();
      };
      const onUp = () => {
        if (!pressed) return;
        pressed = false;
        hide();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
      cleanupRef.current = () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        line.remove();
        readout.remove();
      };
    }
    const prevCleanup = cleanupRef.current;
    cleanupRef.current = () => {
      chart.off('finished', onFinished);
      prevCleanup?.();
    };
  }, [scrubs]);

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
