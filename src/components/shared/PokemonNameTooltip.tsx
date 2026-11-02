import { useEffect, useRef, useState, type MouseEvent, type PointerEvent as ReactPointerEvent, type ReactElement } from 'react';
import { Tooltip, TooltipArrow, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip';
import { getLocale, useNamesVersion, type PokemonLabel } from '@/i18n';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { PokemonNameText } from './PokemonNameText';

const HOLD_MS = 450;
const HOLD_SLOP_PX = 10;

interface PokemonNameTooltipProps {
  label: PokemonLabel | (() => PokemonLabel);
  detail?: () => string | null;
  children: ReactElement;
  enabled?: boolean;
  touchHold?: boolean;
  testId?: string;
}

// platform: Radix Tooltip ignores touch pointers, so a finger hold opens the tip itself.
export function PokemonNameTooltip({ enabled = true, ...props }: PokemonNameTooltipProps) {
  return enabled ? <ActiveNameTooltip {...props} /> : props.children;
}

function ActiveNameTooltip({ label, detail, children, touchHold = true, testId = 'pokemon-name-tooltip' }: PokemonNameTooltipProps) {
  const [open, setOpen] = useState(false);
  const hold = useTouchHold(setOpen);
  return (
    <Tooltip open={open} onOpenChange={setOpen} disableHoverableContent>
      <TooltipTrigger asChild className="select-none" {...(touchHold ? hold : {})}>{children}</TooltipTrigger>
      <TooltipPortal>
        <Name label={label} detail={detail} testId={testId} />
      </TooltipPortal>
    </Tooltip>
  );
}

function useTouchHold(setOpen: (open: boolean) => void) {
  const stopRef = useRef<(() => void) | null>(null);
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

  const onContextMenu = (event: MouseEvent) => {
    if (stopRef.current || heldRef.current) event.preventDefault();
  };

  const onClickCapture = (event: MouseEvent) => {
    if (!heldRef.current) return;
    heldRef.current = false;
    event.preventDefault();
    event.stopPropagation();
    setOpen(false);
  };

  return { onPointerDown, onContextMenu, onClickCapture };
}

function Name({ label: source, detail: detailOf, testId }: {
  label: PokemonLabel | (() => PokemonLabel);
  detail?: () => string | null;
  testId: string;
}) {
  useNamesVersion();
  const label = typeof source === 'function' ? source() : source;
  const detail = detailOf?.() ?? null;
  const cjk = /^(ja|zh-)/.test(getLocale());
  return <TooltipContent
    data-testid={testId}
    aria-label={detail ? `${label.full}${cjk ? '（' : ' ('}${detail}${cjk ? '）' : ')'}` : label.full}
    collisionPadding={getAppliedRootFontSizePx()}
    className={`z-[200] border-0 bg-foreground px-2 py-1 text-xs font-medium text-background shadow-lg max-w-[calc(100vw-2rem)] whitespace-normal break-words ${detail ? 'text-center' : 'text-left'}`}
  >
    <TooltipArrow className="fill-foreground" />
    <span data-i18n-exempt="pokemon-name"><PokemonNameText name={label.full} /></span>
    {detail && <span data-testid={`${testId}-detail`} data-i18n-exempt="game-title"
      className="block text-[0.625rem] font-normal leading-tight opacity-70">{detail}</span>}
  </TooltipContent>;
}
