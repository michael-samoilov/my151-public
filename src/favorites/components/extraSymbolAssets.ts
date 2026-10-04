import starter from '../icons/starter-white.svg?url';
import legendary from '../icons/legendary-white.svg?url';
import gimmick from '../icons/gimmick-white.svg?url';
import favorite from '../icons/favorite-white.svg?url';
import type { ExtraTypeAxis } from '../model/cells';

/** Transparent white versions of the existing category header symbols. */
export const EXTRA_SYMBOL: Record<ExtraTypeAxis, string> = { starter, legendary, gimmick, favorite };
