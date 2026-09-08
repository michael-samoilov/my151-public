import { useCallback, useRef, useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowUpDown, ChevronRight, Plus } from 'lucide-react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { formAt } from '../model/powerups';
import { typeIconPath } from '@/data/type-ids';
import { starPath } from '@/lib/sectionOutlines';
import { createEffectiveCursorCollision, dragInputIsTouch, isTouchDrag } from '@/lib/dragCollision';
import { cn } from '@/lib/utils';
import { useDragSensors } from '@/lib/dragSensors';
import { BOSS_ROW, SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { deriveRow, moveSeat } from '../model/engine';
import { cardShades } from '../theme';
import { fitStyle, useFitScale } from '../useFitScale';
import { legendsOf, powerupsAt, useLeagueStore, type GymCard } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars } from './glyphs';

/**
 * The league home: the card, zoomed out. One row per slot, led by the glyph
 * cell and the type chip, teams right-aligned; four red spacers; rows drag
 * to reorder and tap to open their card.
 *
 * Columns: glyph, type, six team seats, then the action column. The team
 * block is six wide because that is the largest team the template holds, so
 * the column the old right-aligned layout always left empty on the left now
 * sits on the right and carries the row's own affordance.
 */

const ROW_H = 2.75; // 44px
const BAND_H = 1.25;
const GREY = '#a3a3a3';
/**
 * Sprite size, as a share of the row. The gym card draws its sprites at 96%
 * of its row height and lets them overhang the cell — that overhang is what
 * makes a sprite read as a creature rather than an icon — so the summary
 * takes the same proportion instead of the timid 77% it had.
 */
const SPRITE_REM = 2.625;
const BAND_RED = '#dc2626';
/** The widest team any row holds — the team block's column count. */
const TEAM_COLS = 6;

/**
 * How far above the thumb the drop is read, on touch.
 *
 * A finger covers about a row and a half of this list, so the row it picks
 * has to sit clear of it. The dex pages do the same thing with 180px over
 * their much taller tiles (`src/lib/dragCollision.ts`).
 */
const HIT_LIFT_PX = 64;

/** How far the copy is lifted off the slot it would fill. */
const rowCollision = createEffectiveCursorCollision(HIT_LIFT_PX);
/**
 * The copy sits *on* the row it would be placed in, not above it.
 *
 * `snapOverlayToTarget` anchors it to the target row's own rect, so no offset
 * is what centres it there — and before the thumb travels the target is the
 * row it came from, which is also where the thumb is. One rule covers both.
 */

const SECTION_BEFORE: Record<number, string> = {
  0: 'GYM LEADERS',
  8: 'ELITE FOUR',
  12: 'CHAMPION',
  13: 'ENDGAME BOSS',
};

function SlotGlyph({ index, cell }: { index: number; cell: string }) {
  const kind = slotKind(index);
  if (kind === 'gym') return <GymBadges n={index + 1} />;
  if (kind === 'elite') return <Stars n={index - 7} size={9} wrap={index - 7 === 4} />;
  if (kind === 'champion') return <Crown size={13} />;
  return <BossBall cell={cell} size={15} />;
}

/**
 * One league row.
 *
 * `position` is where the row sits on screen — it decides the glyph, the row
 * of the card that shows, and the drop target. `cardIndex` is whose card is
 * drawn there, which differs from `position` only while a drag previews a
 * reorder. Splitting the two is what lets a dragged row re-derive its team at
 * the size its would-be position allows.
 */
/**
 * A row's face, with nothing interactive on it. The row itself renders one,
 * and so does the copy held under the pointer during a drag — one component
 * so the held copy cannot drift from the thing it is a copy of.
 */
function SlotRowFace({ position, card }: { position: number; card: GymCard }) {
  const view = useLeagueStore((s) => s.view);
  const shades = card.type ? cardShades(card.type) : null;
  const cellColour = shades ? shades.cell : GREY;
  // The gym challenge reads each trainer at the row you meet them; the
  // rematch view reads every trainer at their last row instead.
  const row = view === 'rematch' ? BOSS_ROW : slotRow(position);
  const cells = deriveRow(card.lines, row, row === BOSS_ROW ? legendsOf(card) : []);
  const filled = card.lines.length > 0;

  return (
    <div
      className="grid w-full items-center rounded-[0.3125rem] text-left"
      style={{
        gridTemplateColumns: `2.75rem 2rem repeat(${TEAM_COLS + 1}, minmax(0, 1fr))`,
        height: `${ROW_H}rem`,
        background: shades ? shades.base : '#ffffff',
        boxShadow: 'inset 0 1px 0 #f0f0f1',
      }}
    >
        <span
          className="mx-[0.1875rem] flex items-center justify-center self-center rounded-[0.3125rem]"
          style={{ height: `${ROW_H - 0.625}rem`, background: cellColour }}
        >
          <SlotGlyph index={position} cell={cellColour} />
        </span>
        <span className="flex items-center justify-center">
          {card.type === 'none' ? (
            <svg viewBox="0 0 22 22" className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem]" aria-label="No type" role="img">
              <rect width="22" height="22" rx="5" fill="#9CA3AF" />
              <path d={starPath(11, 11, 7)} fill="#ffffff" />
            </svg>
          ) : card.type ? (
            <img src={typeIconPath(card.type)} alt={card.type} className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem]" />
          ) : (
            // The same grey the row's action square beside it paints. Set
            // inline: `src/index.css` sets `* { border-color }` outside any
            // `@layer`, and an unlayered rule beats every border-colour
            // utility, so a class here would be a name only.
            <span
              className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem] border-[1.4px] border-dashed"
              style={{ borderColor: 'var(--color-border)' }}
            />
          )}
        </span>
        {Array.from({ length: TEAM_COLS - cells.length }, (_, k) => (
          <span key={`sp-${k}`} />
        ))}
        {cells.map((cell) => {
          const p = cell.pokemonId !== null ? getPokemonById(cell.pokemonId) : undefined;
          // The summary is a small copy of the card's own row, so a seat
          // wearing a Mega or Gigantamax wears it here too. Without this the
          // champion row showed Charizard while its card showed Mega
          // Charizard X.
          const form = formAt(powerupsAt(card, row), row, cell.seat, cell.pokemonId);
          return (
            <span key={cell.seat} className="flex items-center justify-center">
              {p ? (
                <img
                  // Keyed by its source, so a row that changes teams paints
                  // nothing rather than the frame it already decoded.
                  key={form ? `/sprites/pokemon/${form.id}.png` : p.sprite}
                  src={form ? `/sprites/pokemon/${form.id}.png` : p.sprite}
                  alt={form ? form.label : p.name}
                  className="max-w-none"
                  style={{ width: `${SPRITE_REM}rem`, height: `${SPRITE_REM}rem`, imageRendering: 'pixelated' }}
                />
              ) : filled ? (
                <EmptySlotBall size={18} />
              ) : null}
            </span>
          );
        })}
        {/* The row's own affordance. The whole row opens the card, so this
            says which of the two things the row is for: start it, or open
            what is already there. */}
        <span
          aria-hidden
          data-testid={`league-action-${position}`}
          data-action={filled ? 'open' : 'add'}
          className={cn(
            'flex items-center justify-center justify-self-center rounded-md',
            filled
              ? 'text-muted-foreground'
              : 'h-[1.875rem] w-[1.875rem] border-[1.4px] border-dashed border-[#d4d4d4] text-[#a3a3a3]',
          )}
        >
        {filled ? <ChevronRight size={16} strokeWidth={2.4} /> : <Plus size={12} strokeWidth={2.4} />}
      </span>
    </div>
  );
}

/**
 * An open slot, drawn where the carried row would land.
 *
 * The copy in hand already shows that team, so drawing it here too would
 * draw it twice. The gap says "this is the place" and nothing more.
 */
/** The row as the league renders it: a drop target that drags and opens. */
function SlotRow({ position, cardIndex, held }: {
  position: number;
  cardIndex: number;
  /** This row is where the carried one would land, so it draws it in hand. */
  held: boolean;
}) {
  const card = useLeagueStore((s) => s.cards[cardIndex]);
  const openCardPage = useLeagueUi((s) => s.openCardPage);
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: `slot-${position}`,
    data: { index: position },
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: `slotdrop-${position}`, data: { index: position } });

  return (
    <div ref={setDropRef}>
      <button
        type="button"
        ref={setDragRef}
        {...listeners}
        {...attributes}
        data-testid={`league-slot-${position}`}
        onClick={() => openCardPage(cardIndex)}
        className="block w-full cursor-pointer"
        // Not `none`: that takes the browser's own gestures along with the
        // app's, and these rows are the whole summary, so a pinch anywhere on
        // it did nothing. The press-and-hold the sensor now requires is what
        // separates a drag from a pinch, not a blanket claim on touch.
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        {held ? (
          // The carried row is drawn *here*, in the slot it would fill, rather
          // than in a drag overlay positioned over it. An overlay cannot be
          // aligned to this row reliably: its modifier runs before React has
          // committed the reorder, so every rect it can read is a frame stale
          // — measured, that left the copy exactly one row past its slot. The
          // row it would become has no such problem, because it *is* the row.
          <div
            data-drag-held
            data-placement="on"
            className="origin-center overflow-hidden rounded-[0.3125rem] shadow-lg ring-1 ring-black/10"
            style={{ transform: `scale(${HELD_ROW_SCALE})` }}
          >
            <SlotRowFace position={position} card={card} />
          </div>
        ) : (
          <SlotRowFace position={position} card={card} />
        )}
      </button>
    </div>
  );
}

/** How much smaller the copy in hand is than the row it came from. */
const HELD_ROW_SCALE = 0.82;

export function LeagueHome() {
  const moveSlot = useLeagueStore((s) => s.moveSlot);
  const sensors = useDragSensors();
  const fitRef = useRef<HTMLDivElement>(null);
  const fit = useFitScale(fitRef);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  const cards = useLeagueStore((s) => s.cards);
  // Nothing placed anywhere: a row's tap can only mean "add a trainer", so
  // the hint says that instead of naming a card that does not exist yet. A
  // card counts as used once it holds a line, a type or a name — the same
  // test `SlotRowFace` uses to decide whether to draw a face at all.
  const blank = cards.every(
    (c) => c.lines.length === 0 && !c.type && !c.theme && !c.badgeName,
  );

  const onDragStart = useCallback((e: DragStartEvent) => {
    // Only a finger needs the lift; a mouse cursor covers nothing. This is a
    // PointerSensor, so the activator is a PointerEvent and never a
    // TouchEvent — read `pointerType`, or the lift never applies on a phone.
    dragInputIsTouch.current = isTouchDrag(e.activatorEvent);
    const position = (e.active.data.current as { index: number } | undefined)?.index;
    if (position === undefined) return;
    // Seeded at pickup: the row is over itself before it travels, so the very
    // first frame already draws it in hand rather than showing an untouched
    // row for a frame and then swapping.
    setPreview({ from: position, to: position });
  }, []);

  const onDragOver = useCallback((e: DragOverEvent) => {
    const from = (e.active.data.current as { index: number } | undefined)?.index;
    const to = (e.over?.data.current as { index: number } | undefined)?.index;
    if (from === undefined || to === undefined) return;
    setPreview((cur) => (cur && cur.to === to && cur.from === from ? cur : { from, to }));
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      dragInputIsTouch.current = false;
      setPreview(null);
      const from = (e.active.data.current as { index: number } | undefined)?.index;
      const to = (e.over?.data.current as { index: number } | undefined)?.index;
      if (from === undefined || to === undefined || from === to) return;
      moveSlot(from, to);
    },
    [moveSlot],
  );

  // The arrangement as it would land: each position draws the card that would
  // sit there, at the team size that position allows. Same contract as the
  // card grid's column preview — what you see mid-drag is what you get.
  const order = preview
    ? moveSeat(
        Array.from({ length: SLOT_COUNT }, (_, i) => i),
        preview.from + 1,
        preview.to + 1,
      )
    : Array.from({ length: SLOT_COUNT }, (_, i) => i);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rowCollision}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragCancel={() => { dragInputIsTouch.current = false; setPreview(null); }}
    >
      <div ref={fitRef} style={fitStyle(fit)}>
        <div className="rounded-xl bg-card p-1 px-2 shadow-elevated">
          {order.map((cardIndex, position) => (
            <div key={position}>
              {SECTION_BEFORE[position] && (
                <div
                  className={cn('flex items-center rounded-[0.3125rem] px-2 text-white', position > 0 && 'mt-px')}
                  style={{ height: `${BAND_H}rem`, background: BAND_RED }}
                >
                  <b className="text-[0.5625rem] font-extrabold tracking-[0.07em]">{SECTION_BEFORE[position]}</b>
                </div>
              )}
              <SlotRow
                position={position}
                cardIndex={cardIndex}
                held={preview !== null && position === preview.to}
              />
            </div>
          ))}
        </div>
        {/* Neither line may wrap. The whole card is scaled to fit the
            viewport's height, and that scale is computed back from the card's
            own measured height — so a hint that wraps at one zoom and not at
            another feeds its own input and the fit never settles. `truncate`
            is what holds each hint to one line, so the box can size to its
            own content. It used to carry a written-down height as well, and
            that height left the top padding out: the box measured 29px while
            it painted 37, so the fit ended the card 8px above its last line
            and the phone cropped it. */}
        <div
          data-fit-tail
          className="px-[0.375rem] pt-2 text-[0.625rem] leading-[1.35] text-muted-foreground"
        >
          <div className="flex items-start gap-[0.3125rem]">
            <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
            <span className="min-w-0 truncate">Drag a row to reorder the league</span>
          </div>
          {/* What a tap actually does depends on whether anything is there
              yet, so the second line says the one that applies rather than
              covering both and leaving the reader to work out which. */}
          <div className="mt-[0.125rem] flex items-start gap-[0.3125rem]">
            {blank ? (
              <Plus className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
            ) : (
              <ChevronRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
            )}
            <span className="min-w-0 truncate">
              {blank ? 'Tap a row to add a trainer' : 'Tap a row to open its trainer card'}
            </span>
          </div>
        </div>
      </div>
      {/* The copy in hand: the row that was grabbed, at the width it was
          grabbed at, drawn by the same component as the row itself. */}
    </DndContext>
  );
}
