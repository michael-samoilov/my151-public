import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, X } from 'lucide-react';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_NAMES } from '@/types/pokemon';
import { localeUppercase, typeLabels } from '@/i18n';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_BADGE, TYPE_BADGE_H, TYPE_BADGE_W, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { cn } from '@/lib/utils';
import { slotLabel } from '../model/constants';
import { useLeagueStore, type CardType } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { useCardView } from '../useCardView';
import { useFitScale } from '../useFitScale';
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
 * the type symbol sits. `wide` spans the picker grid's full bottom row —
 * the viewBox widens while the 40-unit height keeps badge-height parity;
 * the standard width is the chip a card with an explicit "no type" wears.
 */
const NO_TYPE_BADGE_WIDE_W = 621;

function NoTypeBadge({ wide = false, className }: { wide?: boolean; className?: string }) {
  const label = 'NO TYPE';
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  const glyph = typeBadgeGlyphBox();
  const w = wide ? NO_TYPE_BADGE_WIDE_W : TYPE_BADGE_W;
  const cx = wide ? w / 2 : TYPE_BADGE.textCenterX;
  return (
    <svg
      viewBox={`0 0 ${w} ${TYPE_BADGE_H}`}
      className={cn('h-auto', wide ? 'w-full' : undefined, className)}
      role="img"
      aria-label="No type"
    >
      <rect width={w} height={TYPE_BADGE_H} rx={TYPE_BADGE.radius} fill="#9CA3AF" />
      <path
        d={starPath(glyph.x + glyph.size / 2, glyph.y + glyph.size / 2, glyph.size / 2)}
        fill="#ffffff"
      />
      {/* The condense is part of the fit, not decoration: without it the word
          is set a third wider than every real type badge and overhangs the
          space the geometry reserves on both sides. */}
      <g transform={`translate(${cx} 0) scale(${fit.scaleX} 1) translate(${-cx} 0)`}>
        <text
          x={cx}
          y={fit.baseline}
          textAnchor="middle"
          fontSize={fit.fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#ffffff"
        >
          {label}
        </text>
      </g>
    </svg>
  );
}

/**
 * The unset-type chip, through the same pipeline: badge geometry and text
 * fit, a red outline, and a plus where the type symbol sits — so choosing a
 * type replaces it with an identically proportioned badge.
 */
function SelectTypeBadge({ className }: { className?: string }) {
  const label = 'SELECT A TYPE';
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  const glyph = typeBadgeGlyphBox();
  const cx = glyph.x + glyph.size / 2;
  const cy = glyph.y + glyph.size / 2;
  const arm = glyph.size * 0.32;
  return (
    <svg
      viewBox={`0 0 ${TYPE_BADGE_W} ${TYPE_BADGE_H}`}
      className={cn('h-auto', className)}
      role="img"
      aria-label="Select a type"
    >
      <rect
        x="1.5"
        y="1.5"
        width={TYPE_BADGE_W - 3}
        height={TYPE_BADGE_H - 3}
        rx={TYPE_BADGE.radius - 1.5}
        fill="#ffffff"
        stroke="#dc2626"
        strokeWidth="3"
      />
      <line x1={cx - arm} y1={cy} x2={cx + arm} y2={cy} stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
      <line x1={cx} y1={cy - arm} x2={cx} y2={cy + arm} stroke="#dc2626" strokeWidth="4" strokeLinecap="round" />
      <g
        transform={
          `translate(${TYPE_BADGE.textCenterX} 0) scale(${fit.scaleX} 1) ` +
          `translate(${-TYPE_BADGE.textCenterX} 0)`
        }
      >
        <text
          x={TYPE_BADGE.textCenterX}
          y={fit.baseline}
          textAnchor="middle"
          fontSize={fit.fontSize}
          fontWeight={TYPE_BADGE.fontWeight}
          fill="#dc2626"
        >
          {label}
        </text>
      </g>
    </svg>
  );
}

function TypePicker({ cardIndex }: { cardIndex: number }) {
  const setCardType = useLeagueStore((s) => s.setCardType);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  const pick = (t: CardType) => {
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
            onClick={() => pick('none')}
            className="col-span-3 cursor-pointer transition-transform hover:scale-[1.02]"
          >
            <NoTypeBadge wide />
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
      {/* The tool bar — same 44px as the dex builder's. */}
      <div data-testid="league-tool-bar" className={cn('flex h-11 items-center gap-2 px-3', showBack && 'border-b bg-card')}>
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
          {view.card.type === null ? (
            <SelectTypeBadge className="w-[4.75rem]" />
          ) : view.card.type === 'none' ? (
            <NoTypeBadge className="w-[4.75rem]" />
          ) : (
            <TypeBadge type={view.card.type} className="w-[4.75rem]" />
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
      {/* Both pickers are `position: fixed`, and a transformed ancestor
          becomes the containing block for fixed descendants. Mobile puts the
          card inside a translated two-pane track, which anchored them to the
          200%-wide track instead of the viewport — the type picker spanned
          both panes. A portal takes them out of the tree entirely, so no
          ancestor can move them again. React context still reaches them. */}
      {typePickerOpen && createPortal(<TypePicker cardIndex={cardIndex} />, document.body)}
      {movePickerOpen && createPortal(<MovePicker cardIndex={cardIndex} />, document.body)}
    </div>
  );
}
