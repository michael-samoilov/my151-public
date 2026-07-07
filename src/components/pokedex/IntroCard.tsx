import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TYPE_COLORS } from '@/data/type-colors';
import { X } from 'lucide-react';

/**
 * First-visit intro card — the top of the Build page for a brand-new visitor.
 *
 * Job: in a few seconds, communicate (1) what this is, (2) what the payoff
 * artifact looks like (the showcase fan), and (3) the one obvious first action
 * (choose your starters). Inline, not a modal: it should read as part of the
 * page, an invitation rather than an interstitial.
 *
 * Lifecycle: shown only while the dex is empty and the card was never
 * dismissed. The ✕ dismisses it forever; placing the first Pokémon collapses
 * it forever (activation happened — its job is done). Users who already have
 * a dex in progress when this ships are flagged on mount and never see it.
 */

const INTRO_SEEN_KEY = 'p151-intro-seen';

function introSeen(): boolean {
  try {
    return localStorage.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return true; // storage unavailable → can't remember a dismissal, so never show
  }
}

function markIntroSeen() {
  try {
    localStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // best-effort
  }
}

// ---------- placeholder poster faces ----------

// A deterministic spread of type colors so the dot grid reads as a varied,
// personal dex rather than noise (and doesn't reshuffle between renders).
const DOT_PALETTE = Object.values(TYPE_COLORS);

/**
 * Stand-in poster face: a stylized miniature of the View-page grid — dot rows
 * standing in for tiles, filled to a given completion stage. Swappable later
 * for pre-rendered images of real sample dexes without touching the fan.
 */
function PosterFace({ filled }: { filled: number }) {
  const COLS = 12;
  const total = 151;
  const dots = [];
  for (let i = 0; i < total; i++) {
    const cx = 7 + (i % COLS) * 4.9;
    const cy = 16 + Math.floor(i / COLS) * 4.9;
    if (i < filled) {
      dots.push(
        <circle key={i} cx={cx} cy={cy} r={1.7} fill={DOT_PALETTE[(i * 7 + 4) % DOT_PALETTE.length]} opacity={0.85} />,
      );
    } else {
      dots.push(
        <circle key={i} cx={cx} cy={cy} r={1.4} fill="none" stroke="#d4d4d4" strokeWidth={0.6} />,
      );
    }
  }
  return (
    <svg viewBox="0 0 68 88" className="w-full h-full" aria-hidden="true">
      <rect x={0} y={0} width={68} height={88} rx={3} fill="#ffffff" />
      {/* title bar: pokéball dot + wordmark line, echoing the export header */}
      <circle cx={9} cy={8.5} r={2.4} fill="none" stroke="#dc2626" strokeWidth={1.1} />
      <line x1={6.6} y1={8.5} x2={11.4} y2={8.5} stroke="#dc2626" strokeWidth={0.8} />
      <rect x={14} y={7} width={17} height={3} rx={1.5} fill="#e5e5e5" />
      <rect x={54} y={7} width={8} height={3} rx={1.5} fill="#fca5a5" />
      {dots}
      {/* footer credit line */}
      <rect x={22} y={82} width={24} height={2} rx={1} fill="#e5e5e5" />
    </svg>
  );
}

// ---------- showcase fan ----------

const REDUCED_MOTION =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
const FINE_POINTER =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(pointer: fine)')
    : null;

interface FanCard {
  filled: number;
  /** Base placement transform (applied on the outer wrapper; the idle float
   *  animates the inner wrapper so the two transforms never fight). */
  transform: string;
  z: string;
  width: string;
  floatClass: string;
}

// Left→center reads as a dex growing toward completion; the finished poster
// sits front and center as the promise.
const FAN_CARDS: FanCard[] = [
  {
    filled: 47,
    transform: 'translate(-50%, -50%) translateX(-3.8rem) rotate(-11deg) rotateY(18deg) translateY(0.4rem)',
    z: 'z-10',
    width: 'w-[5.6rem]',
    floatClass: 'intro-float-a',
  },
  {
    filled: 104,
    transform: 'translate(-50%, -50%) translateX(3.8rem) rotate(11deg) rotateY(-18deg) translateY(0.4rem)',
    z: 'z-10',
    width: 'w-[5.6rem]',
    floatClass: 'intro-float-c',
  },
  {
    filled: 151,
    transform: 'translate(-50%, -50%) translateY(-0.1rem)',
    z: 'z-20',
    width: 'w-[6.6rem]',
    floatClass: 'intro-float-b',
  },
];

function ShowcaseFan() {
  const planeRef = useRef<HTMLDivElement>(null);

  // Desktop-only pointer tilt (poke-holo style, restrained). Direct style
  // writes so mousemove never re-renders React.
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const plane = planeRef.current;
    if (!plane || REDUCED_MOTION?.matches || !FINE_POINTER?.matches) return;
    const r = e.currentTarget.getBoundingClientRect();
    const dx = (e.clientX - r.left) / r.width - 0.5;
    const dy = (e.clientY - r.top) / r.height - 0.5;
    plane.style.transform = `rotateX(${(-dy * 7).toFixed(2)}deg) rotateY(${(dx * 9).toFixed(2)}deg)`;
  }, []);

  const handleMouseLeave = useCallback(() => {
    const plane = planeRef.current;
    if (plane) plane.style.transform = '';
  }, []);

  return (
    <div
      className="relative h-40 [perspective:900px]"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        ref={planeRef}
        className="absolute inset-0 [transform-style:preserve-3d] transition-transform duration-200 ease-out"
      >
        {FAN_CARDS.map((card) => (
          <div
            key={card.filled}
            className={`absolute left-1/2 top-1/2 ${card.z} ${card.width}`}
            style={{ transform: card.transform }}
          >
            <div
              className={`aspect-[68/88] rounded-md border border-border/80 bg-white shadow-lg overflow-hidden ${card.floatClass}`}
            >
              <PosterFace filled={card.filled} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- intro card ----------

const STARTER_DOTS = ['#7ac74c', '#ee8130', '#6390f0'];
const COLLAPSE_MS = 450;

export function IntroCard({
  totalPlaced,
  onChooseStarters,
}: {
  totalPlaced: number;
  onChooseStarters: () => void;
}) {
  const [phase, setPhase] = useState<'shown' | 'collapsing' | 'gone'>(() => {
    if (introSeen()) return 'gone';
    if (totalPlaced > 0) {
      // Existing dex predating the intro card — never show it.
      markIntroSeen();
      return 'gone';
    }
    return 'shown';
  });

  const collapse = useCallback(() => {
    setPhase((p) => (p === 'shown' ? 'collapsing' : p));
  }, []);

  // First Pokémon placed → the card's job is done; fold away gracefully.
  // State adjustment during render (not an effect) per react.dev guidance.
  if (phase === 'shown' && totalPlaced > 0) setPhase('collapsing');

  useEffect(() => {
    if (phase !== 'collapsing') return;
    markIntroSeen();
    const t = setTimeout(() => setPhase('gone'), COLLAPSE_MS);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === 'gone') return null;

  return (
    <div
      className="grid transition-[grid-template-rows,opacity] ease-in-out"
      style={{
        gridTemplateRows: phase === 'collapsing' ? '0fr' : '1fr',
        opacity: phase === 'collapsing' ? 0 : 1,
        transitionDuration: `${COLLAPSE_MS}ms`,
      }}
    >
      <div className="min-h-0 overflow-hidden">
        <div className="relative rounded-xl border bg-card mb-2 overflow-hidden">
          <button
            type="button"
            aria-label="Dismiss intro"
            onClick={collapse}
            className="absolute right-1 top-1 z-30 p-2.5 text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="pt-5 bg-gradient-to-b from-muted/60 to-transparent">
            <ShowcaseFan />
          </div>

          <div className="px-5 pb-5 pt-3 text-center">
            <h2 className="text-xl font-extrabold tracking-tight">
              Build your own <span className="text-primary">151</span>
            </h2>
            <p className="mt-1.5 mx-auto max-w-[26rem] text-sm text-muted-foreground text-pretty">
              Hand-pick your favorites from all 1,025 Pokémon into a Pokédex
              that&rsquo;s entirely yours — then share it as a poster.
            </p>
            <Button onClick={onChooseStarters} className="mt-3.5 gap-2">
              <span className="flex items-center gap-1" aria-hidden="true">
                {STARTER_DOTS.map((c) => (
                  <span key={c} className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
                ))}
              </span>
              Choose your starters
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
