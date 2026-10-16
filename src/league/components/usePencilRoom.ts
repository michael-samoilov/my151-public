import { useLayoutEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether the pencil still has room after the field's own words.
 *
 * The pencil says the line is editable, and once the words fill the line it
 * stops saying anything: the text runs to within four pixels of it and the
 * two read as one crowded run. So it goes when the name outgrows the room
 * the two of them share, and comes back when the name is cut down again.
 *
 * The measurement is against the identity block, not the field. The field's
 * own width already depends on whether the pencil is there, so asking it
 * would make the answer depend on the answer — hide the pencil, the field
 * grows, the words fit, show the pencil, the field shrinks, and the icon
 * flickers for every name whose width lands in those fifteen pixels. The
 * block is sized by the bar and does not move.
 *
 * And the words are measured with a range rather than by the element's
 * `scrollWidth`, which floors at the element's own box: once the pencil went
 * and the box grew, the reading grew with it, and a name cut back down could
 * never win the pencil again. Measured while typing a 41-character name, the
 * pencil now leaves once, at 21 characters, and returns when the name does.
 */

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
