import type { ReactElement } from 'react';
import { Tooltip, TooltipArrow, TooltipContent, TooltipPortal, TooltipTrigger } from '@/components/ui/tooltip';
import { useNamesVersion } from '@/i18n';
import type { PickerMon } from '../model/catalog';
import { labelOf } from './spriteLabel';

/**
 * Shows a Pokémon's name while a mouse rests on its tile. Radix ignores touch
 * pointers, so a tap never opens it. Leaving the tile closes it at once, so
 * the tip never sits over a tile the pointer moves on to.
 *
 * The shared tooltip uses the light popover colors, so this one sets dark
 * colors itself. It sits above the desktop popover and the phone sheet.
 */
export function NameTooltip({ mon, children }: { mon: PickerMon; children: ReactElement }) {
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
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

/** Only an open tooltip renders this, so closed tiles skip the names hook. */
function Name({ mon }: { mon: PickerMon }) {
  useNamesVersion();
  return labelOf(mon);
}
