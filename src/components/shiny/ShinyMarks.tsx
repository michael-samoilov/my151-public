import { useId, type CSSProperties } from 'react';
import { useT } from '@/i18n';
import type { ShinyMark } from '@/league/model/engine';
import { HOLO_STOPS, NO_SHINY, SHINY_GLYPH, SHINY_STAR } from './shinyMarks';

export function ShinyStar({ className, style }: { className?: string; style?: CSSProperties }) {
  const t = useT();
  const fill = useId();
  const { from: [x1, y1], to: [x2, y2], stops } = SHINY_STAR.fill;
  return (
    <svg viewBox="0 0 24 24" role="img" aria-label={t('shiny.label')} data-testid="shiny-star"
      className={className} style={{ overflow: 'visible', ...style }}>
      <defs>
        <linearGradient id={fill} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
          {stops.map(([at, color]) => <stop key={at} offset={at} stopColor={color} />)}
        </linearGradient>
      </defs>
      <path d={SHINY_STAR.path} fill={`url(#${fill})`} stroke={SHINY_STAR.rim} strokeWidth={SHINY_STAR.rimWidth}
        strokeLinejoin="round" paintOrder="stroke" />
    </svg>
  );
}

/** The Shiny glyph when on. Each star takes the whole holo stroke from its own top-left tips to its bottom-right tips. */
export function ShinyGlyph({ className, style }: { className?: string; style?: CSSProperties }) {
  const stroke = useId();
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
      className={className} style={style}>
      <defs>
        <linearGradient id={stroke} x1={0.25} y1={0.25} x2={0.75} y2={0.75}>
          {HOLO_STOPS.map(([at, color]) => <stop key={at} offset={at} stopColor={color} />)}
        </linearGradient>
      </defs>
      <path d={SHINY_GLYPH.big} stroke={`url(#${stroke})`} />
      <path d={SHINY_GLYPH.small} stroke={`url(#${stroke})`} />
    </svg>
  );
}

/** The crossed-out sparkle. `size`, `left`, and `top` are CSS lengths in the sprite box it sits in. */
export function NoShinyMark({ size, left, top }: { size: string; left: string; top: string }) {
  const t = useT();
  const place: CSSProperties = NO_SHINY.placement === 'badge'
    ? { left, top, width: size, height: size, background: NO_SHINY.disc, boxShadow: `0 0 0 1px ${NO_SHINY.ring}` }
    : { left: '50%', top: '50%', width: `calc(${size} * 2)`, height: `calc(${size} * 2)`, transform: 'translate(-50%, -50%)' };
  return (
    <span role="img" aria-label={t('shiny.none')} data-testid="no-shiny-mark"
      className="pointer-events-none absolute z-[16] flex items-center justify-center rounded-full" style={{ color: NO_SHINY.ink, ...place }}>
      <NoShinyGlyph strokeWidth={2.4} style={{ width: '62%', height: '62%' }} />
    </span>
  );
}

/** The Shiny glyph when off: gray, with Lucide's slash in place of the big star's lower-left edge. */
export function NoShinyGlyph({ className, style, strokeWidth = 2 }: { className?: string; style?: CSSProperties; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      aria-hidden className={className} style={style}>
      <path d={SHINY_GLYPH.bigOpen} />
      <path d={SHINY_GLYPH.small} />
      <path d={SHINY_GLYPH.slash} />
    </svg>
  );
}

/** A ring 1 CSS px wide on a 1rem disc, in the disc's 38-unit box. */
const RING = 2.4;

/**
 * The gym card's shiny button: the Shiny glyph in a disc the size of the card's reset and remove
 * discs. On, the ring and the stars take the holo stroke; off, both are gray; with no shiny art, the
 * crossed-out sparkle the browsers show. One svg holds the disc and the glyph, so the two
 * rasterise together under the card's zoom.
 */
export function ShinyDisc({ mark }: { mark: ShinyMark }) {
  const holo = useId();
  const ring = useId();
  const ringWidth = mark === 'on' ? 1.5 * RING : RING;
  const stops = HOLO_STOPS.map(([at, color]) => <stop key={at} offset={at} stopColor={color} />);
  return (
    <svg viewBox="-7 -7 38 38" className="block aspect-square w-full" aria-hidden="true">
      {mark === 'on' ? (
        <defs>
          <linearGradient id={holo} x1={0.25} y1={0.25} x2={0.75} y2={0.75}>{stops}</linearGradient>
          <linearGradient id={ring} gradientUnits="userSpaceOnUse" x1={-7} y1={-7} x2={31} y2={31}>{stops}</linearGradient>
        </defs>
      ) : null}
      <circle cx={12} cy={12} r={19 - ringWidth / 2} fill="#ffffff" strokeWidth={ringWidth}
        stroke={mark === 'on' ? `url(#${ring})` : mark === 'off' ? 'rgba(0,0,0,0.15)' : NO_SHINY.ring} />
      {mark === 'none' ? (
        <g fill="none" stroke={NO_SHINY.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <path d={SHINY_GLYPH.bigOpen} />
          <path d={SHINY_GLYPH.small} />
          <path d={SHINY_GLYPH.slash} />
        </g>
      ) : (
        <g fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d={SHINY_GLYPH.big} stroke={mark === 'on' ? `url(#${holo})` : '#6e6e6e'} />
          <path d={SHINY_GLYPH.small} stroke={mark === 'on' ? `url(#${holo})` : '#6e6e6e'} />
        </g>
      )}
    </svg>
  );
}
