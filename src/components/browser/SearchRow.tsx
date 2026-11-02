import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useTightFit } from '@/hooks/useTightFit';

const TYPING_ROOM_EM = 2;

let canvas: CanvasRenderingContext2D | null = null;

function fullWidth(row: HTMLElement): number {
  const field = row.querySelector('input')!;
  const style = getComputedStyle(field);
  canvas ??= document.createElement('canvas').getContext('2d')!;
  canvas.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  const room = field.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  return row.scrollWidth - room + canvas.measureText(field.placeholder).width + TYPING_ROOM_EM * parseFloat(style.fontSize);
}

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
