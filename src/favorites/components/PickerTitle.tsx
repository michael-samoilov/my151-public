import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_BADGE_ASPECT, TYPE_BADGE_H } from '@/lib/typeBadgeGeometry';
import { displayCoordinate } from './coordinatePresentation';
import { generationBadgeUnits } from './badgeStyle';
import { AxisBadge, GenerationBadge } from './WordBadge';
import type { ExtraTypeAxis, ExtraGenAxis, GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber, isTypeName } from '../model/cells';

const TITLE_BADGE_PX = 22;

export function PickerTitle({ type, gen, maxWidth, gapPx = 6 }: { type: TypeAxisId; gen: GenAxisId; maxWidth?: number; gapPx?: number }) {
  const display = displayCoordinate(type, gen);
  const summary = type === gen;
  const genAspect = display.gen == null ? 0 : isGenNumber(display.gen)
    ? generationBadgeUnits() / TYPE_BADGE_H : TYPE_BADGE_ASPECT;
  const height = maxWidth == null ? TITLE_BADGE_PX
    : Math.min(TITLE_BADGE_PX, Math.max(1, maxWidth - (display.gen == null ? 0 : gapPx)) / (TYPE_BADGE_ASPECT + genAspect));
  const typeBadge = isTypeName(display.type) ? (
    <span className="block shrink-0" style={{ width: height * TYPE_BADGE_ASPECT }}>
      <TypeBadge type={display.type} className="block w-full overflow-visible" />
    </span>
  ) : <AxisBadge id={display.type as ExtraTypeAxis} height={height} className="block shrink-0" />;
  const genBadge = display.gen == null ? null : isGenNumber(display.gen) ? (
    <GenerationBadge gen={display.gen} height={height} className="block shrink-0" />
  ) : <AxisBadge id={display.gen as ExtraGenAxis} height={height} className="block shrink-0" />;
  return (
    <div className="flex items-center" style={{ gap: gapPx }} data-testid="favorites-picker-title">
      {summary ? <>{genBadge}{typeBadge}</> : <>{typeBadge}{genBadge}</>}
    </div>
  );
}
