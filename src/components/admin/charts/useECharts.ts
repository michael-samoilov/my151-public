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
import { categoryIndexAtX, categoryX, clampToRect, lineLeftInPlot, type PlotRect } from './scrubPlot';

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

export function cssVar(el: HTMLElement | null, name: string, fallback = ''): string {
  if (!el) return fallback;
  const v = getComputedStyle(el).getPropertyValue(name).trim();
  return v || fallback;
}

interface ChartScrub {
  count: number;
  xValues?: number[];
  label: (index: number) => string[];
}

export function useECharts(
  build: (el: HTMLDivElement) => EChartsOption,
  opts: {
    scrub?: ChartScrub;
  } = {},
): (el: HTMLDivElement | null) => void {
  const elRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const roRef = useRef<ResizeObserver | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const scrubs = opts.scrub != null;
  const buildRef = useRef(build);
  const scrubRef = useRef(opts.scrub);
  useEffect(() => {
    buildRef.current = build;
    scrubRef.current = opts.scrub;
  });

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
      chart.setOption(buildRef.current(el), true);
    });
    ro.observe(el);
    roRef.current = ro;

    if (scrubs) {
      let pressed = false;
      let hovering = false;

      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
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

      const hide = () => {
        line.style.display = 'none';
        readout.style.display = 'none';
      };
      const showAt = (clientX: number, clientY: number) => {
        const scrub = scrubRef.current;
        if (!scrub || scrub.count <= 0) {
          hide();
          return;
        }
        const r = el.getBoundingClientRect();
        const plot =
          gridRect() ?? {
            x: 1,
            y: 1,
            width: Math.max(r.width - 2, 1),
            height: Math.max(r.height - 2, 1),
          };
        const pinned = clampToRect(clientX - r.left, clientY - r.top, plot);
        let index = categoryIndexAtX(pinned.x, plot, scrub.count - 1);
        let x = categoryX(index, plot, scrub.count - 1);
        if (scrub.xValues?.length) {
          const positions = scrub.xValues.map(value => Number(chart.convertToPixel({xAxisIndex:0}, value)));
          index = positions.reduce((best, value, i) =>
            Math.abs(value-pinned.x) < Math.abs(positions[best]-pinned.x) ? i : best, 0);
          x = positions[index];
        }
        readout.innerHTML = scrub
          .label(index)
          .map((part) => `<span style="white-space:nowrap">${part}</span>`)
          .join(' · ');
        readout.style.display = 'block';
        const w = readout.offsetWidth;
        const maxX = Math.max(el.clientWidth - w, 0);
        readout.style.left = `${Math.max(0, Math.min(x - w / 2, maxX))}px`;
        if (pressed || hovering) {
          line.style.left = `${lineLeftInPlot(x, plot)}px`;
          line.style.top = `${plot.y}px`;
          line.style.height = `${plot.height}px`;
          line.style.bottom = 'auto';
          line.style.display = 'block';
        } else {
          line.style.display = 'none';
        }
      };
      const onDown = (e: PointerEvent) => {
        pressed = true;
        hovering = e.pointerType === 'mouse';
        try { el.setPointerCapture(e.pointerId); } catch { /* Pointer capture rejects inactive pointers. */ }
        showAt(e.clientX, e.clientY);
      };
      const onMove = (e: PointerEvent) => {
        hovering = e.pointerType === 'mouse';
        showAt(e.clientX, e.clientY);
        if (pressed) e.preventDefault();
      };
      const onLeave = () => {
        hovering = false;
        if (!pressed) hide();
      };
      const onUp = (e: PointerEvent) => {
        if (!pressed) return;
        pressed = false;
        const r = el.getBoundingClientRect();
        hovering = e.pointerType === 'mouse' && e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom;
        if (hovering) showAt(e.clientX, e.clientY);
        else hide();
      };
      const onCancel = () => {
        pressed = false;
        hovering = false;
        hide();
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerleave', onLeave);
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onCancel);
      cleanupRef.current = () => {
        el.removeEventListener('pointerdown', onDown);
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerleave', onLeave);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
        line.remove();
        readout.remove();
      };
    }
  }, [scrubs]);

  useEffect(() => {
    const chart = chartRef.current;
    const el = elRef.current;
    if (!chart || !el) return;
    chart.setOption(build(el), true);
  }, [build]);

  return setNode;
}
