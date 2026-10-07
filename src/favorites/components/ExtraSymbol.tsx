import type { ExtraTypeAxis } from '../model/cells';
import { EXTRA_SYMBOL, STARTER_ORIGIN_SYMBOL } from './extraSymbolAssets';

/** White glyph only; the parent supplies the category-colored background. */
export function ExtraSymbol({ id, size = 24, origin = false }: { id: ExtraTypeAxis; size?: number; origin?: boolean }) {
  return <img src={origin && id === 'starter' ? STARTER_ORIGIN_SYMBOL : EXTRA_SYMBOL[id]} alt="" width={size} height={size}
    draggable={false} data-special-symbol={id} className="block shrink-0" />;
}
