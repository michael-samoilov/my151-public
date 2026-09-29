import { createContext } from 'react';

/** The admin bar's ribbon row. A user page portals its session scrubber into
 *  it in place of the date chips. Null until the bar mounts. */
export const RangeSlotContext = createContext<HTMLElement | null>(null);
