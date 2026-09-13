/**
 * The stage glyphs, white on the card's glyph cells. Shapes and proportions
 * come from the design canvas (docs/future-tools/league-builder/canvas).
 */

const GAP_PX = 2;

function starMark(size: number, key: number) {
  return (
    <svg key={key} viewBox="0 0 12 12" className="shrink-0" style={{ width: size, height: size }}>
      <path
        d="M6 0.5 L7.5 4.4 L11.6 4.4 L8.3 6.9 L9.6 10.9 L6 8.5 L2.4 10.9 L3.7 6.9 L0.4 4.4 L4.5 4.4 Z"
        fill="#ffffff"
      />
    </svg>
  );
}

function diamondMark(size: number, key: number, filled: boolean) {
  return (
    <svg key={key} viewBox="0 0 12 12" className="shrink-0" style={{ width: size, height: size }}>
      {filled ? (
        <path d="M6 0 L12 6 L6 12 L0 6 Z" fill="#ffffff" />
      ) : (
        <path d="M6 1 L11 6 L6 11 L1 6 Z" fill="none" stroke="#ffffff" strokeWidth="1.8" />
      )}
    </svg>
  );
}

/** N−1 filled square diamonds plus one outline. Four or fewer sit on one line;
 *  more stack in a fixed four-wide grid so the count never reflows. */
export function GymBadges({ n, size = 7 }: { n: number; size?: number }) {
  const marks = Array.from({ length: n }, (_, i) => diamondMark(size, i, i < n - 1));
  if (n <= 4) {
    return (
      <span className="inline-flex shrink-0 items-center" style={{ gap: GAP_PX }}>
        {marks}
      </span>
    );
  }
  const cols = 4;
  const width = cols * size + (cols - 1) * GAP_PX;
  return (
    <span
      className="inline-grid shrink-0 grid-cols-4 content-center justify-items-start"
      style={{ width, gap: GAP_PX }}
    >
      {marks}
    </span>
  );
}

/** Elite Four stars: one or two on a line; three as two-over-one; four as 2×2. */
export function Stars({ n, size = 10 }: { n: number; size?: number }) {
  const marks = Array.from({ length: n }, (_, i) => starMark(size, i));
  if (n <= 2) {
    return (
      <span className="inline-flex shrink-0 items-center" style={{ gap: GAP_PX }}>
        {marks}
      </span>
    );
  }
  if (n === 3) {
    return (
      <span className="inline-flex shrink-0 flex-col items-center" style={{ gap: GAP_PX }}>
        <span className="inline-flex shrink-0" style={{ gap: GAP_PX }}>
          {marks.slice(0, 2)}
        </span>
        {marks[2]}
      </span>
    );
  }
  const cols = 2;
  const width = cols * size + (cols - 1) * GAP_PX;
  return (
    <span className="inline-grid shrink-0 grid-cols-2" style={{ width, gap: GAP_PX }}>
      {marks}
    </span>
  );
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
export function TmDisc({ colour, size = 22 }: { colour: string; size?: number | string }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: size, height: size }}>
      <g transform="translate(12,12) skewX(-16) translate(-12,-12)">
        <circle cx="12" cy="12" r="9" fill="none" stroke={colour} strokeWidth="2" />
        <circle cx="12" cy="12" r="3.2" fill="none" stroke={colour} strokeWidth="2" />
      </g>
    </svg>
  );
}
