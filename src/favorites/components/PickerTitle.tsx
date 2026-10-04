import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { displayCoordinate } from './coordinatePresentation';
import { AxisBadge, GenerationBadge } from './WordBadge';
import type { ExtraTypeAxis, ExtraGenAxis, GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber, isTypeName } from '../model/cells';

const TITLE_BADGE_PX = 22;

export function PickerTitle({ type, gen }: { type: TypeAxisId; gen: GenAxisId }) {
  const display = displayCoordinate(type, gen);
  const summary = type === gen;
  const typeBadge = isTypeName(display.type) ? (
    <span className="block shrink-0" style={{ width: TITLE_BADGE_PX * TYPE_BADGE_ASPECT }}>
      <TypeBadge type={display.type} className="block w-full overflow-visible" />
    </span>
  ) : <AxisBadge id={display.type as ExtraTypeAxis} height={TITLE_BADGE_PX} className="block shrink-0" />;
  const genBadge = display.gen == null ? null : isGenNumber(display.gen) ? (
    <GenerationBadge gen={display.gen} height={TITLE_BADGE_PX} className="block shrink-0" />
  ) : <AxisBadge id={display.gen as ExtraGenAxis} height={TITLE_BADGE_PX} className="block shrink-0" />;
  return (
    <div className="flex items-center gap-1.5" data-testid="favorites-picker-title">
      {summary ? <>{genBadge}{typeBadge}</> : <>{typeBadge}{genBadge}</>}
    </div>
  );
}
