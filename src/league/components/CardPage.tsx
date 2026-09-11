import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Pencil, Plus, X } from 'lucide-react';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_NAMES, type TypeName } from '@/types/pokemon';
import { localeUppercase, typeLabel, typeLabels } from '@/i18n';
import { typeIconPath } from '@/data/type-ids';
import { starPath } from '@/lib/sectionOutlines';
import { TYPE_BADGE, TYPE_BADGE_H, typeBadgeGlyphBox } from '@/lib/typeBadgeGeometry';
import { typeBadgeFit } from '@/lib/typeBadgeFit';
import { cn } from '@/lib/utils';
import { slotLabel } from '../model/constants';
import { useLeagueStore, type CardType } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { useCardView } from '../useCardView';
import { fitStyle, useFitScale } from '../useFitScale';
import { CardGrid } from './CardGrid';
import { HEADER_FIELD_H, LeagueExportButton } from './HeaderActions';
import { usePencilRoom } from './usePencilRoom';
import { MovePicker } from './MovePicker';
import { confirmOnEnter } from './confirmOnEnter';

/**
 * One open gym card: its identity row (type badge, theme), the 11-row grid,
 * and the pickers it launches. `showBack` is the mobile full-screen mode;
 * the desktop pane renders the same component without it.
 */

/** The page's own name, the way the league home names itself. */
const CARD_NAME = 'Pro Trainer Card';
const THEME_PLACEHOLDER = "What is this gym's theme?";

/**
 * "No type" as a real option: the type badge pipeline's geometry, fit and
 * casing over the no-type grey, with the app's 4-point star spandrel where
 * the type symbol sits. It spans the picker grid's full bottom row — the
 * viewBox widens while the 40-unit height keeps badge-height parity.
 */
const NO_TYPE_BADGE_WIDE_W = 621;

function NoTypeBadge({ className }: { className?: string }) {
  const label = 'NO TYPE';
  const fit = typeBadgeFit(label, typeLabels().map(localeUppercase));
  const glyph = typeBadgeGlyphBox();
  const w = NO_TYPE_BADGE_WIDE_W;
  const cx = w / 2;
  return (
    <svg
      viewBox={`0 0 ${w} ${TYPE_BADGE_H}`}
      className={cn('h-auto w-full', className)}
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
 * The gym's type, as the square icon rather than the wide chip.
 *
 * The 1x1 Gen IX icon the browser and the analytics pages already draw,
 * standing beside the identity block rather than inside it, so the page's
 * name and the theme field both start to its right. 1.875rem is the block's
 * own height, so the square spans the two lines exactly.
 *
 * The chip it replaces was 4.75rem of a 44px bar, and it rode the name line
 * — a line the theme does not use. The square is smaller but it stands
 * beside both lines, so the theme field is about 37px narrower than it was.
 * That is the trade: a mark the gym is recognised by, against six characters
 * of theme.
 */
const TYPE_MARK = '1.875rem';
/**
 * The corner all three squares share.
 *
 * The Gen IX asset is drawn square — measured, its own corner is inset one
 * pixel of sixty, which is half a pixel at this size — so left alone it reads
 * as a sharp tile beside the app's rounded everything. Clipping it here gives
 * the chosen type the same corner the empty and the no-type squares are drawn
 * with, and puts the three states on one shape.
 */
const TYPE_MARK_RADIUS = '0.4375rem';

/** The square a card wears before a type is chosen. */
function UnsetTypeMark() {
  return (
    // A plus alone says "add something". The word says what — the same job
    // the TM disc and the badge hexagon give their own words, and the same
    // 0.06em extrabold they are set in. A solid red tile with white on it
    // rather than the card's dashed grey: this one is a thing left undone,
    // not a slot waiting, and it sits where the chosen type's tile will.
    <span
      className="flex flex-col items-center justify-center gap-[0.09375rem] bg-primary text-primary-foreground"
      style={{ width: TYPE_MARK, height: TYPE_MARK, borderRadius: TYPE_MARK_RADIUS }}
    >
      <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
      <span className="text-[0.40625rem] font-extrabold leading-[1.1] tracking-[0.06em]">TYPE</span>
    </span>
  );
}

/** The square a card wears once "no type" is the answer. */
function NoTypeMark() {
  return (
    // The no-type grey and the 4-point star the NO TYPE badge carries, so
    // the two say the same thing in the header and in the picker.
    <span
      className="grid place-items-center"
      style={{
        width: TYPE_MARK, height: TYPE_MARK,
        borderRadius: TYPE_MARK_RADIUS, background: '#9CA3AF',
      }}
    >
      <svg viewBox="0 0 32 32" className="h-[0.9375rem] w-[0.9375rem]" aria-hidden>
        <path d={starPath(16, 16, 9)} fill="#ffffff" />
      </svg>
    </span>
  );
}

function TypeMark({ type }: { type: CardType }) {
  if (type === null) return <UnsetTypeMark />;
  if (type === 'none') return <NoTypeMark />;
  return (
    // The PNG carries its own colour and its own padding; only its corner
    // has to be taken in.
    <img
      src={typeIconPath(type as TypeName)}
      alt=""
      className="block"
      style={{ width: TYPE_MARK, height: TYPE_MARK, borderRadius: TYPE_MARK_RADIUS }}
    />
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
            <button
              key={t}
              type="button"
              onClick={() => pick(t)}
              // A static light-grey outline on hover, shown at once (no bloom,
              // no fade): a 3px ring that hugs the badge with no gap, the same
              // idiom the dex builder's type filter uses.
              className="cursor-pointer rounded-full hover:ring-[3px] hover:ring-foreground/25"
            >
              <TypeBadge type={t} className="w-full" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick('none')}
            className="col-span-3 cursor-pointer rounded-full hover:ring-[3px] hover:ring-foreground/25"
          >
            <NoTypeBadge />
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * The card's identity, for whichever bar holds it.
 *
 * Its own component for the same reason `LeagueNameRow` is: the two layouts
 * put it in different bars. Mobile gives the card a bar of its own inside the
 * sliding pane; desktop hands it the pane's own header, which is where the
 * league home puts its identity too — so the page's name and the theme land
 * at the size and height the league's own two lines do, instead of a row
 * below a second, differently set title.
 */
export function CardIdentity({ cardIndex, showBack }: { cardIndex: number; showBack: boolean }) {
  const view = useCardView(cardIndex);
  const setCardTheme = useLeagueStore((s) => s.setCardTheme);
  const closeCardPage = useLeagueUi((s) => s.closeCardPage);
  const setTypePickerOpen = useLeagueUi((s) => s.setTypePickerOpen);
  // The square carries no word, so the button says which type it is. "No
  // type" is a chosen answer, not the absence of one, so it says so.
  const typeName = view.card.type === null
    ? ''
    : view.card.type === 'none' ? 'no type' : typeLabel(view.card.type);
  const blockRef = useRef<HTMLDivElement>(null);
  const ghostRef = useRef<HTMLSpanElement>(null);
  const pencilRoom = usePencilRoom(blockRef, ghostRef, view.card.theme);
  return (
    <>
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
      {/* The gym's own mark, before the words and outside them: the square
          stands beside the whole identity block, so the page's name and the
          theme field both start to its right. */}
      <button
        type="button"
        onClick={() => setTypePickerOpen(true)}
        aria-label={`Gym type${typeName ? `: ${typeName}` : ''}`}
        // A static light-grey outline on hover, matching the type picker's
        // badges — shown at once, hugging the square.
        className="shrink-0 cursor-pointer rounded-[0.4375rem] hover:ring-[3px] hover:ring-foreground/25"
      >
        <TypeMark type={view.card.type} />
      </button>
      {/* The league home's identity block, on the card: the page's name
          above, small and quiet, and one editable line under it. */}
      <div ref={blockRef} className="flex min-w-0 flex-1 flex-col justify-center gap-[0.0625rem]">
        <h2 className="truncate text-[0.6875rem] font-semibold leading-none text-muted-foreground">
          {CARD_NAME}
        </h2>
        {/* The field is sized to its own text by an invisible copy in the
            same grid cell, so the dashed line ends where the words do and
            the pencil sits after them. */}
        <label className="group flex min-w-0 max-w-full cursor-text items-center gap-1 overflow-hidden">
          <span
            className="grid min-w-0 items-center overflow-hidden border-b border-dashed border-foreground/25 transition-colors [grid-template-columns:minmax(0,max-content)] group-hover:border-foreground/50 group-focus-within:border-foreground/60"
            style={{ height: HEADER_FIELD_H }}
          >
            {/* The league name's own type: 0.875rem bold. The two fields
                are the same field on two pages, so they are set the same
                and the shared line box puts them at the same height. */}
            <span
              ref={ghostRef}
              aria-hidden
              className={cn(
                'invisible col-start-1 row-start-1 whitespace-pre text-[0.875rem] leading-tight',
                view.card.theme ? 'font-bold' : 'font-normal',
              )}
            >
              {view.card.theme || THEME_PLACEHOLDER}
            </span>
            <input
              value={view.card.theme}
              onChange={(e) => setCardTheme(cardIndex, e.target.value)}
              placeholder={THEME_PLACEHOLDER}
              aria-label="Gym theme"
              enterKeyHint="done"
              onKeyDown={confirmOnEnter}
              // The words are clipped at the field's own box, and a clip
              // lands mid-glyph — which reads as the name running under
              // whatever sits next in the bar rather than ending. An
              // ellipsis says it ends. Browsers draw it only while the
              // field is not focused, which is the behaviour to want: once
              // you are typing you need to see the caret's end of the text,
              // not a mark saying there is more.
              //
              // Only the drawing is cut. `value` is the whole name, and the
              // store keeps it — the export renders from the store.
              className="col-start-1 row-start-1 w-full min-w-0 bg-transparent text-[0.875rem] font-bold leading-tight text-ellipsis outline-none placeholder:font-normal placeholder:text-muted-foreground/60"
            />
          </span>
          {pencilRoom && (
            <Pencil size={11} className="shrink-0 text-primary" aria-hidden />
          )}
        </label>
      </div>
    </>
  );
}

/** The controls both bars carry on their right. */
export function CardActions({ cardIndex }: { cardIndex: number }) {
  return (
    <span className="ml-auto flex shrink-0 items-center gap-1">
      <LeagueExportButton cardIndex={cardIndex} />
    </span>
  );
}

export function CardPage({ cardIndex, showBack, withBar = true }: {
  cardIndex: number;
  showBack: boolean;
  /** Desktop hands the bar to the pane, so the card draws only its body. */
  withBar?: boolean;
}) {
  const view = useCardView(cardIndex);
  const typePickerOpen = useLeagueUi((s) => s.typePickerOpen);
  const movePickerOpen = useLeagueUi((s) => s.movePickerOpen);
  const fitRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale(fitRef);

  return (
    <div className="w-full">
      {withBar && (
        // The tool bar — same 44px as the dex builder's.
        <div
          data-testid="league-tool-bar"
          className={cn('flex h-11 items-center gap-2 px-3', showBack && 'border-b bg-card')}
        >
          <CardIdentity cardIndex={cardIndex} showBack={showBack} />
          <CardActions cardIndex={cardIndex} />
        </div>
      )}
      <div className="px-3 pt-2.5">
        <div ref={fitRef} style={fitStyle(fit)}>
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
