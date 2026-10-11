import type { CSSProperties, ReactNode } from 'react';

/**
 * Icons drawn for this app, in lucide's idiom: a 24-unit box, a 2-unit stroke,
 * round caps and joins, outline only. Lucide has no Pokédex, no Gym emblem, no
 * Bug-type glyph and no Pokémon ribbon. The sources and the rejected drafts are
 * in `docs/design/tools-menu-icons/`.
 */
interface IconProps { className?: string; style?: CSSProperties; strokeWidth?: number }

function Icon({ className, style, strokeWidth = 2, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={style}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** A handheld Pokédex: lens, two indicator lights, and the curved hinge line. */
export function PokedexIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8" cy="8" r="2" />
      <path d="M13 7h.01" />
      <path d="M16.5 7h.01" />
      <path d="M3 13h6.5c1.5 0 2-2 3.5-2h8" />
    </Icon>
  );
}

/** The Pokémon Gym emblem. */
export function GymIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M21.35 3.36L15.61 6.07A6.8 6.8 0 1 0 10.63 15.64L12.31 21.86Z" />
      <path d="M15.61 6.07L11.49 7.99" />
      <path d="M3.29 11.81L7.41 9.89" />
      <circle cx="9.45" cy="8.94" r="2.25" />
    </Icon>
  );
}

/**
 * The Bug type glyph with legs. The body is `scripts/build-type-icons.ts`'s
 * bug at 85%; the legs are lucide `Bug`'s, cut where they meet its outline.
 */
export function BugIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M6.24 7.55C6.22 4.99 9.83 3.51 12 3.51C14.17 3.51 17.78 4.99 17.76 7.55" />
      <path d="M6.24 7.55C1.85 8.52 3.47 20.2 8.48 20.47C8.62 20.45 8.75 20.42 8.89 20.38L12 10.27" />
      <path d="M6.24 7.55C7.89 8.97 9.72 10.27 12 10.27C14.28 10.27 16.11 8.97 17.76 7.55" />
      <path d="M17.76 7.55C22.15 8.52 20.53 20.2 15.52 20.47C15.38 20.45 15.25 20.42 15.11 20.38L12 10.27" />
      <path d="M11.09 13.48L12 13.48L12.91 13.48" />
      <path d="M10.18 16.34C10.78 16.52 11.37 16.66 12 16.66C12.63 16.66 13.22 16.52 13.82 16.34" />
      <path d="M9.28 19.15C10.18 19.46 11.04 19.76 12 19.76C12.96 19.76 13.82 19.46 14.72 19.15" />
      <path d="M21 5A4 4 0 0 1 19.13 8.38" />
      <path d="M22 13L20.3 13" />
      <path d="M21 21A4 4 0 0 0 19.12 17.6" />
      <path d="M3 5A4 4 0 0 0 4.87 8.38" />
      <path d="M2 13L3.7 13" />
      <path d="M3 21A4 4 0 0 1 4.88 17.6" />
    </Icon>
  );
}

/**
 * A ribbon with a Poké Ball as its pin, after the games' ribbons: two tails
 * with swallowtail cuts hang from behind the ball.
 */
export function RibbonIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M7.44 13.97L5.2 22L7.48 20L9.76 22L11.53 15.68" />
      <path d="M16.56 13.97L18.8 22L16.52 20L14.24 22L12.47 15.68" />
      <circle cx="12" cy="8.85" r="6.85" />
      <path d="M5.15 8.85H9.7" />
      <path d="M14.3 8.85H18.85" />
      <circle cx="12" cy="8.85" r="2.3" />
    </Icon>
  );
}

/**
 * A Pokémon Egg about to hatch. The outline, the crack and the three edge
 * spots are traced from the games' cracked-egg sprite. The crack opens a little
 * about the crown, so every run stays 2 units clear of its neighbours. Drawn
 * at `pathScale(1.35)`. Sources: `docs/design/tools-menu-icons/egg-*`.
 */
export function EggIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 2C13.98 2 15.99 3.08 17.64 4.93C19.3 6.78 20.6 9.38 20.97 12C21.33 14.62 20.69 17.22 19.03 19.07C17.37 20.92 14.71 22 12 22C9.29 22 6.63 20.92 4.97 19.07C3.31 17.22 2.67 14.62 3.03 12C3.4 9.38 4.7 6.78 6.36 4.93C8.01 3.08 10.02 2 12 2Z" />
      <path d="M12 2L12 5.2" />
      <path d="M12 5.2L10 6.7L10 7.01" />
      <path d="M12 5.2L13.3 6.9L13.3 8" />
      <path d="M13.3 8L13.78 10.1" />
      <path d="M13.3 8L15.3 8.8L15.48 8.96" />
      <path d="M4.36 7.86A4 2.76 0 1 1 2.93 13.16" />
      <path d="M20.02 17.7A3.45 3.45 0 1 1 21.05 12.78" />
      <path d="M4.79 18.87A2.76 2.76 0 1 1 9.53 21.71" />
    </Icon>
  );
}
