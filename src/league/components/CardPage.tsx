import { useLayoutEffect, useRef, useState } from 'react';
import { ChevronLeft, X } from 'lucide-react';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { localeUppercase, typeLabels } from '@/i18n';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_BADGE, TYPE_BADGE_H, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { cn } from '@/lib/utils';
import { slotLabel } from '../model/constants';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { useCardView } from '../useCardView';
import { CardGrid } from './CardGrid';
import { MovePicker } from './MovePicker';

/**
 * One open gym card: its identity row (type badge, theme), the 11-row grid,
 * and the pickers it launches. `showBack` is the mobile full-screen mode;
 * the desktop pane renders the same component without it.
 */

/**
 * "No type" as a real option: the type badge pipeline's geometry, fit and
 * casing over the no-type grey, with the app's 4-point star spandrel where
 * the type symbol sits. Wide — it spans the picker grid's full bottom row —
 * so the viewBox widens while the 40-unit height keeps badge-height parity.
 */
const NO_TYPE_BADGE_W = 621;

function NoTypeBadge() {
  const label = 'NO TYPE';
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  const glyph = typeBadgeGlyphBox();
  return (
    <svg
      viewBox={`0 0 ${NO_TYPE_BADGE_W} ${TYPE_BADGE_H}`}
      className="h-auto w-full"
      role="img"
      aria-label="No type"
    >
      <rect width={NO_TYPE_BADGE_W} height={TYPE_BADGE_H} rx={TYPE_BADGE.radius} fill="#9CA3AF" />
      <path
        d={starPath(glyph.x + glyph.size / 2, glyph.y + glyph.size / 2, glyph.size / 2)}
        fill="#ffffff"
      />
      <text
        x={NO_TYPE_BADGE_W / 2}
        y={fit.baseline}
        textAnchor="middle"
        fontSize={fit.fontSize}
        fontWeight={TYPE_BADGE.fontWeight}
        fill="#ffffff"
      >
        {label}
      </text>
    </svg>
  );
}

/**
 * Fit zoom: the whole template must sit inside the viewport, so the card and
 * its hint lines shrink as one unit when the screen is short. CSS `zoom`
 * participates in layout and scales px, rem, text and SVG together — the
 * proportional shrink the responsive-sizing rules ask for. The applied scale
 * is divided out of `natural` so the loop is a fixed point, not a spiral.
 */
function useFitScale(ref: React.RefObject<HTMLDivElement | null>): number {
  const [scale, setScale] = useState(1);
  const scaleRef = useRef(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const viewport = el.closest('[data-lg-viewport]');
    const compute = () => {
      const rect = el.getBoundingClientRect();
      const natural = rect.height / scaleRef.current;
      if (natural <= 0) return;
      let avail: number;
      if (viewport instanceof HTMLElement) {
        const vp = viewport.getBoundingClientRect();
        // clientHeight includes the container's own padding, so its bottom
        // padding must come out of the budget or the fit overflows by it.
        const padBottom = parseFloat(getComputedStyle(viewport).paddingBottom) || 0;
        avail = viewport.clientHeight - (rect.top - vp.top + viewport.scrollTop) - padBottom - 2;
      } else {
        avail = window.innerHeight - rect.top - 8;
      }
      // Floor at 0.55: below that the card stops being readable, and a short
      // scroll beats an unreadable fit.
      const next = Math.min(1, Math.max(0.55, avail / natural));
      // 0.003 ≈ 2–3px at card height: tight enough to actually fit, loose
      // enough not to churn on subpixel measurements.
      if (Math.abs(next - scaleRef.current) > 0.003) {
        scaleRef.current = next;
        setScale(next);
      }
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [ref]);
  return scale;
}

function TypePicker({ cardIndex }: { cardIndex: number }) {
  const setCardType = useLeagueStore((s) => s.setCardType);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const pick = (t: TypeName | null) => {
    setCardType(cardIndex, t);
    setTypePickerOpen(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => setTypePickerOpen(false)} />
      <div className="relative rounded-t-2xl bg-background p-4 shadow-2xl md:w-[24rem] md:rounded-2xl">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-semibold">Gym type</span>
          <button
            type="button"
            onClick={() => setTypePickerOpen(false)}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {TYPE_NAMES.map((t) => (
            <button key={t} type="button" onClick={() => pick(t)} className="cursor-pointer transition-transform hover:scale-105">
              <TypeBadge type={t} className="w-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick(null)}
            className="col-span-3 cursor-pointer transition-transform hover:scale-[1.02]"
          >
            <NoTypeBadge />
          </button>
        </div>
      </div>
    </div>
  );
}

export function CardPage({ cardIndex, showBack }: { cardIndex: number; showBack: boolean }) {
  const view = useCardView(cardIndex);
  const setCardTheme = useLeagueStore((s) => s.setCardTheme);
  const closeCardPage = useLeagueUi((s) => s.closeCardPage);
  const typePickerOpen = useLeagueUi((s) => s.typePickerOpen);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const movePickerOpen = useLeagueUi((s) => s.movePickerOpen);
  const fitRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale(fitRef);

  return (
    <div className="w-full">
      <div className={cn('flex items-center gap-2 px-3 py-[0.4375rem]', showBack && 'border-b bg-card')}>
        {showBack && (
          <button
            type="button"
            onClick={closeCardPage}
            aria-label={`Back to the league (${slotLabel(cardIndex)})`}
            className="cursor-pointer text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={20} />
          </button>
        )}
        <button
          type="button"
          onClick={() => setTypePickerOpen(true)}
          aria-label="Gym type"
          className="cursor-pointer transition-transform hover:scale-105"
        >
          {view.card.type ? (
            <TypeBadge type={view.card.type} className="w-[4.75rem]" />
          ) : (
            // Same height as the badge that replaces it (w-[4.75rem] at the
            // 5:1 badge aspect), so choosing a type shifts no layout.
            <span className="inline-flex h-[0.95rem] items-center whitespace-nowrap rounded-full border-[1.5px] border-dotted border-primary px-2.5 text-[0.625rem] font-semibold text-primary">
              Select a type
            </span>
          )}
        </button>
        <input
          value={view.card.theme}
          onChange={(e) => setCardTheme(cardIndex, e.target.value)}
          placeholder="What is this gym's theme?"
          aria-label="Gym theme"
          className="min-w-0 flex-1 bg-transparent text-[0.6875rem] font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground/70"
        />
        <span className="shrink-0 text-[0.6875rem] font-medium text-muted-foreground">{slotLabel(cardIndex)}</span>
      </div>
      <div className="px-3 pt-2.5">
        <div ref={fitRef} style={{ zoom: fit }}>
          <CardGrid cardIndex={cardIndex} view={view} />
        </div>
      </div>
      {typePickerOpen && <TypePicker cardIndex={cardIndex} />}
      {movePickerOpen && <MovePicker cardIndex={cardIndex} />}
    </div>
  );
}
