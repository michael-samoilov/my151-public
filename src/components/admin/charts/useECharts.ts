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

/** A tooltip pinned to the top strip of the chart (one line, never wrapping),
 *  so scrubbing never covers the plotted content. Pair it with a `grid.top`
 *  tall enough to hold the tooltip, and a `touch-none` container so a scrub
 *  gesture doesn't scroll the page. `pointer-events:none` keeps the tooltip from
 *  eating the pointer as it tracks the cursor. */
export function topTooltip(el: HTMLElement | null) {
  return {
    ...tooltipStyle(el),
    confine: false,
    // No fade, so a held scrub reads as a solid readout, not a flickering one.
    transitionDuration: 0,
    // The scrub handler drives show/hide, so echarts never hides it on its own
    // mouseout when the pointer runs off the plot edge mid-drag. It flips
    // alwaysShowContent on for the duration of a drag (see useECharts).
    triggerOn: 'none',
    position: (point: number[], _params: unknown, _dom: unknown, _rect: unknown, size: { contentSize: number[]; viewSize: number[] }) => {
      const w = size.contentSize[0];
      const x = Math.max(0, Math.min(point[0] - w / 2, size.viewSize[0] - w));
      return [x, 0];
    },
    extraCssText: 'border-radius:8px;box-shadow:0 4px 14px rgba(9,9,15,0.10);white-space:nowrap;pointer-events:none;',
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
  opts: { scrub?: boolean; overlayPointer?: boolean } = {},
): (el: HTMLDivElement | null) => void {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const scrub = opts.scrub ?? false;
  const overlayPointer = opts.overlayPointer ?? false;
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
    chart.setOption(buildRef.current(el), true);
    const ro = new ResizeObserver(() => {
      chart.resize();
      // Re-run the builder on resize so geometry that scales with width
      // (label cadence, insets) recomputes, mirroring the mockup's chartScale.
      chart.setOption(buildRef.current(el), true);
    });
    ro.observe(el);
    roRef.current = ro;

    if (scrub) {
      // Keep the tooltip alive and clamped to the plot while a press is held —
      // scrubbing off the edge pins it to the boundary instead of dismissing
      // it. It only hides on release. Pairs with a `touch-none` container so
      // the drag never scrolls the page.
      let scrubbing = false;

      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const line = document.createElement('div');
      line.style.cssText =
        'position:absolute;width:1px;top:0;bottom:0;pointer-events:none;display:none;z-index:1;';
      line.style.background = cssVar(el, '--color-muted-foreground', '#737373');
      line.style.opacity = '0.5';
      el.appendChild(line);

      // The plot rect, so the line spans the same band as echarts' own axis
      // pointer. Internal API, so guard it and fall back to the full height.
      const gridRect = (): { y: number; height: number } | null => {
        try {
          // getModel is internal, so reach it through an untyped view.
          const model = (chart as unknown as { getModel(): { getComponent(t: string, i: number): unknown } }).getModel();
          const cs = (
            model.getComponent('grid', 0) as
              | { coordinateSystem?: { getRect?: () => { y: number; height: number } } }
              | undefined
          )?.coordinateSystem;
          return cs?.getRect?.() ?? null;
        } catch {
          return null;
        }
      };

      const showAt = (clientX: number, clientY: number, clamp: boolean) => {
        const r = el.getBoundingClientRect();
        const rawX = clientX - r.left;
        const rawY = clientY - r.top;
        let x = rawX;
        let y = rawY;
        if (clamp) {
          x = Math.max(1, Math.min(rawX, r.width - 1));
          y = Math.max(1, Math.min(rawY, r.height - 1));
        }
        chart.dispatchAction({ type: 'showTip', x, y });
        const off =
          clamp && (rawX < 1 || rawX > r.width - 1 || rawY < 1 || rawY > r.height - 1);
        if ((overlayPointer && scrubbing) || off) {
          const rect = gridRect();
          line.style.left = `${x}px`;
          if (rect) {
            line.style.top = `${rect.y}px`;
            line.style.height = `${rect.height}px`;
            line.style.bottom = 'auto';
          }
          line.style.display = 'block';
        } else {
          line.style.display = 'none';
        }
      };
      const hidePointer = () => {
        chart.setOption({ tooltip: { alwaysShowContent: false } });
        chart.dispatchAction({ type: 'hideTip' });
        chart.dispatchAction({ type: 'updateAxisPointer', currTrigger: 'leave' });
        line.style.display = 'none';
      };
      const onDown = (e: PointerEvent) => {
        scrubbing = true;
        try { el.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
        // Keep the tip alive while the pointer is off the plot, then turn the
        // flag back off on release so hideTip actually hides it.
        chart.setOption({ tooltip: { alwaysShowContent: true } });
        showAt(e.clientX, e.clientY, true);
      };
      const onMove = (e: PointerEvent) => {
        // Dragging clamps to the plot so the readout pins to the edge; a plain
        // hover (no button) tracks the cursor as usual.
        showAt(e.clientX, e.clientY, scrubbing);
        if (scrubbing) e.preventDefault();
      };
      const onLeave = () => {
        if (!scrubbing) hidePointer();
      };
      const onUp = () => {
        if (!scrubbing) return;
        scrubbing = false;
        hidePointer();
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
      };
    }
  }, [scrub, overlayPointer]);

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
