import starter from '../icons/starter-white.svg?url';
import starterSvg from '../icons/starter-white.svg?raw';
import legendary from '../icons/legendary-white.svg?url';
import gimmick from '../icons/gimmick-white.svg?url';
import favorite from '../icons/favorite-white.svg?url';
import type { ExtraTypeAxis } from '../model/cells';

export const EXTRA_SYMBOL: Record<ExtraTypeAxis, string> = { starter, legendary, gimmick, favorite };

export const STARTER_ORIGIN_SYMBOL = `data:image/svg+xml,${encodeURIComponent(
  starterSvg.replace('viewBox="0 0 24 24"', 'viewBox="3.2 6.72 17.6 12"'),
)}`;
