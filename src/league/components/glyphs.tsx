/**
 * The stage glyphs, white on the card's glyph cells. Shapes and proportions
 * come from the design canvas (docs/future-tools/league-builder/canvas).
 */

/** N−1 filled square diamonds plus one outline. Wraps after four; from four
 *  diamonds up, lines left-align so the marks stack as a block. */
export function GymBadges({ n, size = 7 }: { n: number; size?: number }) {
  const marks = Array.from({ length: n }, (_, i) => (
    <svg key={i} viewBox="0 0 12 12" style={{ width: size, height: size }}>
      {i < n - 1 ? (
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="#ffffff" />
      ) : (
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="none" stroke="#ffffff" strokeWidth="1.8" />
      )}
    </svg>
  ));
  if (n <= 4) return <span className="flex items-center gap-[2px]">{marks}</span>;
  return (
    <span
      className="flex flex-wrap content-center justify-start gap-[2px]"
      style={{ width: 4 * size + 6 }}
    >
      {marks}
    </span>
  );
}

export function Stars({ n, size = 10, wrap = false }: { n: number; size?: number; wrap?: boolean }) {
  const marks = Array.from({ length: n }, (_, i) => (
    <svg key={i} viewBox="0 0 12 12" style={{ width: size, height: size }}>
      <path
        d="M6 0.5 L7.5 4.4 L11.6 4.4 L8.3 6.9 L9.6 10.9 L6 8.5 L2.4 10.9 L3.7 6.9 L0.4 4.4 L4.5 4.4 Z"
        fill="#ffffff"
      />
    </svg>
  ));
  if (wrap) {
    return (
      <span
        className="flex flex-wrap content-center justify-center gap-[2px]"
        style={{ width: 2 * size + 2 }}
      >
        {marks}
      </span>
    );
  }
  return <span className="flex items-center gap-[2px]">{marks}</span>;
}

export function Crown({ size = 15 }: { size?: number }) {
  return (
    <svg viewBox="0 0 16 16" style={{ width: size, height: size }}>
      <path d="M2 12.5 L1 3.6 L5.2 7.2 L8 2.2 L10.8 7.2 L15 3.6 L14 12.5 Z" fill="#ffffff" />
      <rect x="2" y="13" width="12" height="1.6" rx="0.8" fill="#ffffff" />
    </svg>
  );
}

/** The solid pokeball: the ball is the white, the cell colour its negative
 *  space — the weight of the filled crown (concept B on the boards). */
export function BossBall({ cell, size = 17 }: { cell: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <circle cx="12" cy="12" r="10.5" fill="#ffffff" />
      <rect x="0" y="10.7" width="24" height="2.6" fill={cell} />
      <circle cx="12" cy="12" r="5" fill={cell} />
      <circle cx="12" cy="12" r="2.7" fill="#ffffff" />
    </svg>
  );
}

/** The view page's empty-slot mark: a faint pokeball, turned 30°. */
export function EmptySlotBall({ size = 26 }: { size?: number }) {
  const c = 'rgba(10,10,10,0.14)';
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size, transform: 'rotate(-30deg)' }} fill="none">
      <circle cx="12" cy="12" r="11" stroke={c} strokeWidth="1.5" />
      <line x1="1" y1="12" x2="8.5" y2="12" stroke={c} strokeWidth="1.5" />
      <line x1="15.5" y1="12" x2="23" y2="12" stroke={c} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="3.5" stroke={c} strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.5" fill={c} />
    </svg>
  );
}

/** A pokeball with the band taken out, sheared — the TM disc. */
export function TmDisc({ colour, size = 22 }: { colour: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <g transform="translate(12,12) skewX(-16) translate(-12,-12)">
        <circle cx="12" cy="12" r="9" fill="none" stroke={colour} strokeWidth="2" />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke={colour} strokeWidth="2" />
      </g>
    </svg>
  );
}
