import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

const OVERSCAN_PX = 800;
const STEP_PX = 64;
const FALLBACK_ROW_PX = 96;

const heights = new Map<string, number>();
let heightsWidth = 0;
let lastGap = 8;

const Row = memo(function Row<T>({ item, render }: { item: T; render: (item: T) => ReactNode }) {
  return render(item);
}) as <T>(props: { item: T; render: (item: T) => ReactNode }) => ReactNode;

function firstAfter(offsets: Float64Array, gap: number, y: number): number {
  let lo = 0;
  let hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] - gap <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function VirtualRows<T>({
  items,
  keyOf,
  render,
  className,
}: {
  items: readonly T[];
  keyOf: (item: T) => string;
  render: (item: T) => ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState(0);
  const [gap, setGap] = useState(lastGap);

  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('scroll', notify, { passive: true });
    window.addEventListener('resize', notify);
    const ro = new ResizeObserver(notify);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('scroll', notify);
      window.removeEventListener('resize', notify);
      ro.disconnect();
    };
  }, []);
  const view = useSyncExternalStore(
    subscribe,
    () => {
      const top = ref.current?.getBoundingClientRect().top ?? 0;
      return `${Math.floor(Math.max(0, -top) / STEP_PX)}:${window.innerHeight}`;
    },
    () => '0:0',
  );
  const [step, viewport] = view.split(':').map(Number);

  const keys = useMemo(() => items.map(keyOf), [items, keyOf]);
  const offsets = useMemo(() => {
    void measured;
    let sum = 0;
    let n = 0;
    for (const key of keys) {
      const h = heights.get(key);
      if (h !== undefined) {
        sum += h;
        n += 1;
      }
    }
    const guess = n > 0 ? sum / n : FALLBACK_ROW_PX;
    const out = new Float64Array(keys.length + 1);
    keys.forEach((key, i) => {
      out[i + 1] = out[i] + (heights.get(key) ?? guess) + gap;
    });
    return out;
  }, [keys, gap, measured]);

  const count = items.length;
  const total = count > 0 ? offsets[count] - gap : 0;
  const from = step * STEP_PX - OVERSCAN_PX;
  const to = step * STEP_PX + viewport + STEP_PX + OVERSCAN_PX;
  const start = count > 0 ? firstAfter(offsets, gap, from) : 0;
  let end = start;
  while (end < count && offsets[end] < to) end += 1;
  const padTop = end > start ? offsets[start] : total;
  const padBottom = end > start ? total - (offsets[end] - gap) : 0;

  const rowsRO = useRef<ResizeObserver | null>(null);
  const keyOfEl = useRef(new WeakMap<Element, string>());
  const observed = useRef(new Set<Element>());
  useLayoutEffect(() => {
    const wrapper = ref.current;
    const ro = new ResizeObserver((entries) => {
      let changed = false;
      for (const e of entries) {
        if (e.target !== wrapper) continue;
        const width = e.contentRect.width;
        if (width !== heightsWidth) {
          heights.clear();
          heightsWidth = width;
          changed = true;
        }
        const g = parseFloat(getComputedStyle(wrapper).rowGap) || 0;
        if (g !== lastGap) {
          lastGap = g;
          setGap(g);
        }
      }
      for (const e of entries) {
        const key = keyOfEl.current.get(e.target);
        if (key === undefined) continue;
        const h = e.borderBoxSize?.[0]?.blockSize ?? e.target.getBoundingClientRect().height;
        if (Math.abs((heights.get(key) ?? -1) - h) > 0.25) {
          heights.set(key, h);
          changed = true;
        }
      }
      if (changed) setMeasured((v) => v + 1);
    });
    if (wrapper) ro.observe(wrapper);
    rowsRO.current = ro;
    const seen = observed.current;
    return () => {
      ro.disconnect();
      seen.clear();
    };
  }, []);
  useLayoutEffect(() => {
    const wrapper = ref.current;
    const ro = rowsRO.current;
    if (!wrapper || !ro) return;
    const now = new Set<Element>();
    for (let i = 0; i < end - start; i++) {
      const el = wrapper.children[i];
      if (!el) break;
      now.add(el);
      keyOfEl.current.set(el, keys[start + i]);
      if (!observed.current.has(el)) ro.observe(el);
    }
    for (const el of observed.current) if (!now.has(el)) ro.unobserve(el);
    observed.current = now;
  });

  return (
    <div ref={ref} className={className} style={{ paddingTop: padTop, paddingBottom: padBottom }}>
      {items.slice(start, end).map((item, i) => (
        <Row key={keys[start + i]} item={item} render={render} />
      ))}
    </div>
  );
}
