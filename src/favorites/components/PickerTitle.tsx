import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_BADGE_ASPECT } from '@/lib/typeBadgeGeometry';
import { displayCoordinate } from './coordinatePresentation';
import { titleUnits, TITLE_BADGE_PX } from './titleGeometry';
import { AxisBadge, GenerationBadge } from './WordBadge';
import type { ExtraTypeAxis, ExtraGenAxis, GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber, isTypeName } from '../model/cells';

export function PickerTitle({ type, gen, maxWidth, gapPx = 6 }: { type: TypeAxisId; gen: GenAxisId; maxWidth?: number; gapPx?: number }) {
  const display = displayCoordinate(type, gen);
  const summary = type === gen;
  const { aspect, gaps } = titleUnits(type, gen);
  const height = maxWidth == null ? TITLE_BADGE_PX
    : Math.min(TITLE_BADGE_PX, Math.max(1, maxWidth - gaps * gapPx) / aspect);
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
