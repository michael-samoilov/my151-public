import type { TypeName } from '@/types/pokemon';
import { typeLabel, useLocale } from '@/i18n';
import { TYPE_BADGE_H, TYPE_BADGE_W } from '@/lib/typeBadgeGeometry';
import { typeBadgeSvg } from '@/components/shared/typeBadgeSvg';

/**
 * The Gen IX type badge, rendered rather than shipped as an image.
 *
 * The type name is baked into the official badge sprites, and no localized set
 * of them exists anywhere: PokeAPI's sprite repo has no language-coded assets
 * at any generation, the request for them has sat unanswered since early 2025,
 * and no fan project fills the gap for Scarlet/Violet. Pre-rendering our own
 * 18 x 9 rasters would need CJK fonts in the build and would fight the
 * container-relative sizing the rest of the app uses. So: the colour and the
 * symbol come from the official art, and the word is drawn live from the
 * published `type_names` string for the active locale.
 *
 * SVG rather than a flex box on purpose — see `baselineShift` in
 * `typeBadgeGeometry.ts`. The short version is that a flex box centres text by
 * the font's own ascent and descent, and Latin and CJK fonts disagree about
 * those, so the same rule puts the two scripts at different heights inside a
 * fixed pill. An SVG baseline placed a fixed fraction of the font size below
 * the centre uses no font metrics and lands both correctly.
 */
export function TypeBadge({ type, className }: {
  type: TypeName;
  /** Sets the width; the height follows from the 5:1 aspect. */
  className?: string;
}) {
  // Subscribes to the locale so the word changes with it. `typeLabel` itself is
  // a plain read, which is what the canvas exporter needs.
  useLocale();
  const label = typeLabel(type);
  return (
    <svg
      viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`}
      className={`h-auto ${className ?? ''}`}
      role="img"
      aria-label={label}
    >
      {typeBadgeSvg(type, label)}
    </svg>
  );
}
