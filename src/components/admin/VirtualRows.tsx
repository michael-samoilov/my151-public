import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';

/** Rows rendered past each edge of the viewport, so a fling never reaches a
 *  row before it renders. */
const OVERSCAN_PX = 800;
/** The list position is read in steps of this many pixels, so a scroll
 *  renders the list only when it has moved a step. */
const STEP_PX = 64;
/** A row's height before any row has been measured. */
const FALLBACK_ROW_PX = 96;

/**
 * Measured row heights by key. Kept for the page's life, so a list that
 * mounts again (Back from a detail page) places the rows above the reader at
 * their real heights and the reader lands on the same row. A new list width
 * clears them.
 */
const heights = new Map<string, number>();
let heightsWidth = 0;
let lastGap = 8;

/** One row, rendered again only when its item or its renderer changes. */
const Row = memo(function Row<T>({ item, render }: { item: T; render: (item: T) => ReactNode }) {
  return render(item);
}) as <T>(props: { item: T; render: (item: T) => ReactNode }) => ReactNode;

/** The first index whose row ends after `y`. */
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

/**
 * Renders the rows of `items` near the viewport and stands in for the others
 * with padding. The page's own scroll moves the list. Each row is a direct
 * child of the wrapper, so a wrapper that is a column subgrid keeps its rows
 * on the parent table's columns. `render` must return one element per item.
 */
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

  // How far the viewport top sits below the list top, in steps, and the
  // viewport height. Above the list, the list renders its first rows.
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener('scroll', notify, { passive: true });
    window.addEventListener('resize', notify);
    // Content above the list can grow or shrink without a scroll.
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

  // Measures each rendered row, and the list width and gap, as they lay out.
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
