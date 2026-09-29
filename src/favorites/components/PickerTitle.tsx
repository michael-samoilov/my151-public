import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { AxisBadge, GenerationBadge } from './WordBadge';
import type { ExtraTypeAxis, ExtraGenAxis, GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber, isTypeName } from '../model/cells';

const TITLE_BADGE_PX = 22;

export function PickerTitle({ type, gen }: { type: TypeAxisId; gen: GenAxisId }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="favorites-picker-title">
      {isTypeName(type) ? (
        <span className="block shrink-0" style={{ width: TITLE_BADGE_PX * TYPE_BADGE_ASPECT }}>
          <TypeBadge type={type} className="block w-full overflow-visible" />
        </span>
      ) : (
        <AxisBadge id={type as ExtraTypeAxis} height={TITLE_BADGE_PX} className="block shrink-0" />
      )}
      {isGenNumber(gen) ? (
        <GenerationBadge gen={gen} height={TITLE_BADGE_PX} className="block shrink-0" />
      ) : (
        <AxisBadge id={gen as ExtraGenAxis} height={TITLE_BADGE_PX} className="block shrink-0" />
      )}
    </div>
  );
}
