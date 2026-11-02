import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

// platform: `scrollWidth` floors at the element's own box, so the words are measured with a Range instead.

const PENCIL_PX = 11;
const PENCIL_GAP_REM = 0.25;

export function usePencilRoom(
  block: RefObject<HTMLElement | null>,
  ghost: RefObject<HTMLElement | null>,
  text: string,
): boolean {
  const [room, setRoom] = useState(true);
  const roomRef = useRef(true);
  useLayoutEffect(() => {
    const b = block.current;
    const g = ghost.current;
    if (!b || !g) return;
    const compute = () => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const range = document.createRange();
      range.selectNodeContents(g);
      const words = range.getBoundingClientRect().width;
      const next = words <= b.clientWidth - (PENCIL_PX + PENCIL_GAP_REM * rem);
      if (next !== roomRef.current) {
        roomRef.current = next;
        setRoom(next);
      }
    };
    compute();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(compute);
    ro.observe(b);
    return () => ro.disconnect();
  }, [block, ghost, text]);
  return room;
}
