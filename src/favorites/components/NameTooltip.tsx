import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { Tooltip, TooltipArrow, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip';
import { useNamesVersion } from '@/i18n';
import type { PickerMon } from '../model/catalog';
import { labelOf } from './spriteLabel';

/** A finger held still this long on a tile shows its name. */
const HOLD_MS = 450;
/** A finger that moves farther than this before HOLD_MS is a scroll, not a hold. */
const HOLD_SLOP_PX = 10;

/**
 * Shows a Pokémon's name while a mouse rests on its tile, or while a finger
 * holds it. Radix ignores touch pointers, so the hold opens the tip itself.
 * Leaving the tile or lifting the finger closes it at once, so the tip never
 * sits over a tile the pointer moves on to.
 *
 * The shared tooltip uses the light popover colors, so this one sets dark
 * colors itself. It sits above the desktop popover and the phone sheet.
 */
export function NameTooltip({ mon, children }: { mon: PickerMon; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const hold = useTouchHold(setOpen);
  return (
    <Tooltip open={open} onOpenChange={setOpen} disableHoverableContent>
      <TooltipTrigger asChild className="select-none" {...hold}>{children}</TooltipTrigger>
      <TooltipPortal>
        <TooltipContent
          data-testid="favorites-name-tooltip"
          className="z-[200] border-0 bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg"
        >
          <TooltipArrow className="fill-foreground" />
          <Name mon={mon} />
        </TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

/**
 * Opens the tip after a touch pointer holds still for HOLD_MS, and closes it
 * when that finger lifts. A move past HOLD_SLOP_PX, a scroll, a second finger,
 * or a pointercancel drops a hold that has not opened yet, so scrolls and
 * pinches go on as usual. The click that can follow a hold does not reach the
 * tile, so a hold never picks, opens, or clears.
 */
function useTouchHold(setOpen: (open: boolean) => void) {
  const stopRef = useRef<(() => void) | null>(null);
  // Set when a hold opened the tip, and kept until the next press, because
  // some browsers send no click after a hold.
  const heldRef = useRef(false);
  useEffect(() => () => stopRef.current?.(), []);

  const onPointerDown = (event: ReactPointerEvent) => {
    stopRef.current?.();
    heldRef.current = false;
    if (event.pointerType !== 'touch' || !event.isPrimary) return;
    const { pointerId, clientX, clientY } = event;
    const listen = { capture: true, passive: true } as const;
    const timer = window.setTimeout(() => {
      heldRef.current = true;
      setOpen(true);
    }, HOLD_MS);
    function stop() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', onMove, listen);
      window.removeEventListener('pointerup', onEnd, listen);
      window.removeEventListener('pointercancel', onEnd, listen);
      window.removeEventListener('pointerdown', onOtherDown, listen);
      window.removeEventListener('scroll', stop, listen);
      stopRef.current = null;
      if (heldRef.current) setOpen(false);
    }
    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId || heldRef.current) return;
      if (Math.hypot(e.clientX - clientX, e.clientY - clientY) > HOLD_SLOP_PX) stop();
    }
    function onEnd(e: PointerEvent) {
      if (e.pointerId === pointerId) stop();
    }
    function onOtherDown(e: PointerEvent) {
      if (e.pointerId !== pointerId) stop();
    }
    window.addEventListener('pointermove', onMove, listen);
    window.addEventListener('pointerup', onEnd, listen);
    window.addEventListener('pointercancel', onEnd, listen);
    window.addEventListener('pointerdown', onOtherDown, listen);
    window.addEventListener('scroll', stop, listen);
    stopRef.current = stop;
  };

  // The hold, not the platform, answers a long press: no context menu.
  const onContextMenu = (event: MouseEvent) => {
    if (stopRef.current || heldRef.current) event.preventDefault();
  };

  // Capture runs before the tile's own click handler and Radix's.
  const onClickCapture = (event: MouseEvent) => {
    if (!heldRef.current) return;
    heldRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  return { onPointerDown, onContextMenu, onClickCapture };
}

/** Only an open tooltip renders this, so closed tiles skip the names hook. */
function Name({ mon }: { mon: PickerMon }) {
  useNamesVersion();
  return labelOf(mon);
}
