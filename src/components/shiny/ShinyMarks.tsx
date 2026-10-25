import type { CSSProperties } from 'react';
import { Sparkles } from 'lucide-react';
import { useT } from '@/i18n';
import { NO_SHINY, SHINY_STAR } from './shinyMarks';

export function ShinyStar({ className, style }: { className?: string; style?: CSSProperties }) {
  const t = useT();
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={t('shiny.label')} data-testid="shiny-star"
      className={className} style={{ overflow: 'visible', ...style }}>
      <path d={SHINY_STAR.path} fill={SHINY_STAR.fill} stroke={SHINY_STAR.rim} strokeWidth={SHINY_STAR.rimWidth}
        strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  );
}

/** The crossed-out sparkle. `size`, `left`, and `top` are CSS lengths in the sprite box it sits in. */
export function NoShinyMark({ size, left, top }: { size: string; left: string; top: string }) {
  const t = useT();
  const place: CSSProperties = NO_SHINY.placement === 'badge'
    ? { left, top, width: size, height: size, background: NO_SHINY.disc, boxShadow: NO_SHINY.ring }
    : { left: '50%', top: '50%', width: `calc(${size} * 2)`, height: `calc(${size} * 2)`, transform: 'translate(-50%, -50%)' };
  return (
    <span role="img" aria-label={t('shiny.none')} data-testid="no-shiny-mark"
      className="pointer-events-none absolute z-[16] flex items-center justify-center rounded-full" style={{ color: NO_SHINY.ink, ...place }}>
      <NoShinyGlyph style={{ width: '62%', height: '62%' }} />
    </span>
  );
}

/** Lucide's sparkles, crossed out: no shiny, or the Shiny switch while off. */
export function NoShinyGlyph({ size, style }: { size?: number; style?: CSSProperties }) {
  return (
    <Sparkles size={size} strokeWidth={2.2} aria-hidden style={style}>
      <path d="M3 3l18 18" strokeWidth={2.6} />
    </Sparkles>
  );
}
