import type { ExtraTypeAxis } from '../model/cells';
import { EXTRA_SYMBOL } from './extraSymbolAssets';

/** White glyph only; the parent supplies the category-colored background. */
export function ExtraSymbol({ id, size = 24 }: { id: ExtraTypeAxis; size?: number }) {
  return <img src={EXTRA_SYMBOL[id]} alt="" width={size} height={size}
    draggable={false} data-special-symbol={id} className="block shrink-0" />;
}
