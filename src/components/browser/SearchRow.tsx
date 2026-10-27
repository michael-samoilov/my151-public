import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTightFit } from '@/hooks/useTightFit';

/** Room to type past the placeholder, in the search field's font size. */
const TYPING_ROOM_EM = 2;

let canvas: CanvasRenderingContext2D | null = null;

/** The row width at which the search field fits its placeholder plus TYPING_ROOM_EM, with every item at full size. */
function fullWidth(row: HTMLElement): number {
  const field = row.querySelector('input')!;
  const style = getComputedStyle(field);
  canvas ??= document.createElement('canvas').getContext('2d')!;
  canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const room = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return row.scrollWidth - room + canvas.measureText(field.placeholder).width + TYPING_ROOM_EM * parseFloat(style.fontSize);
}

/**
 * The browser's search row. Given a `layout`, it passes `tight` to its
 * children when the row is too narrow for their full size.
 *
 * `layout` names the texts that set the full row's width. When it or the
 * row's width changes, the children render in full once and the row
 * measures them, so the measurement never sees its own collapse.
 */
export function SearchRow({ layout, children }: {
  layout: string | null;
  children: (tight: boolean) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const measures = layout !== null;
  const tight = useTightFit(measures && width > 0 ? `${layout}|${width}` : null, ref, (row) => row.clientWidth < fullWidth(row));

  useLayoutEffect(() => {
    const row = ref.current;
    if (!row || !measures) return;
    const read = () => setWidth(row.clientWidth);
    read();
    const observer = new ResizeObserver(read);
    observer.observe(row);
    return () => observer.disconnect();
  }, [measures]);

  return (
    <div ref={ref} className="flex items-center gap-2">
      {children(tight)}
    </div>
  );
}
