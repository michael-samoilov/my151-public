import { ExtraMark, RomanDisc, TypeIcon } from './marks';
import type { ExtraTypeAxis, ExtraGenAxis, GenAxisId, TypeAxisId } from '../model/cells';
import { isGenNumber, isTypeName } from '../model/cells';

const TITLE_TYPE_PX = 24;
const TITLE_DISC_PX = 27;

export function PickerTitle({ type, gen }: { type: TypeAxisId; gen: GenAxisId }) {
  return (
    <div className="flex items-center gap-1.5" data-testid="favorites-picker-title">
      {isTypeName(type) ? (
        <TypeIcon type={type} size={TITLE_TYPE_PX} />
      ) : (
        <ExtraMark id={type as ExtraTypeAxis} size={TITLE_TYPE_PX} />
      )}
      {isGenNumber(gen) ? (
        <RomanDisc gen={gen} size={TITLE_DISC_PX} />
      ) : (
        <ExtraMark id={gen as ExtraGenAxis} size={TITLE_DISC_PX} />
      )}
    </div>
  );
}
