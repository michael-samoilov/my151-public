import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  rectIntersection,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowLeftRight, ArrowUpDown, RotateCcw } from 'lucide-react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { HeldItems } from '@/components/shared/dragHold';
import { cn } from '@/lib/utils';
import { useDragSensors } from '@/lib/dragSensors';
import { warmImages } from '@/lib/warmImages';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW, ROW_COUNT, TEAM_SIZES, joinRow } from '../model/constants';
import {
  defaultBoundaries,
  deriveRows,
  moveSeat as reorderLines,
  signatureMember,
  stageAt,
} from '../model/engine';
import { getMoveById } from '../moves';
import { CategoryChip } from './CategoryChip';
import { legendAt, legendsOf, powerupAt, powerupsAt, useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { openLeagueBrowser } from '../store/browserBridge';
import type { CardView } from '../useCardView';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars, TmDisc } from './glyphs';
import { formAt, formsFor, isPowerupRow, type PowerupForm, type PowerupKind } from '../model/powerups';
import { LaurelIcon } from './LaurelIcon';
import { SEAM_RIGHT, placeFree, placeHalf, sharedSprite, type Placed, type Runs } from '../slotLayout';
import { useSlotLab } from '../slotLab';

/**
 * The 11-row gym leader card. Geometry mirrors the design canvas
 * (Main.dc.html): a stack of fixed-height rows in rem — so the JS root
 * font-size scales the whole card — with the signature/TM/badge slots
 * absolutely positioned over the top-left void, measured against the same
 * cell insets the glyph cells use.
 */

// rem units (boards are px at a 390px frame; 1rem = 16px there).
const ROW_H = 3.375; // 54px
const BAND_H = 1.25; // 20px
const PAD_X = 0.5; // 8px
const PAD_Y = 0.6875; // 11px
const INSET_Y = 0.375; // 6px
const INSET_X = 0.1875; // 3px
/** Cell sprite size; larger than the cell on purpose, as on the boards. */
const SPRITE_REM = 3.25;

/**
 * How far a carried column lifts off the card.
 *
 * Enough that the open seat reads underneath it, little enough that the
 * column still looks like it belongs to the row it is over.
 */
const CELL_LIFT_REM = 0.5;

/** Rows whose glyph cell is double width, reaching the card's left edge. */
const GLYPH_SPAN: Record<number, number> = { 1: 2, 8: 2, 9: 2 };
const BAND_BEFORE: Record<number, { label: string; note?: string }> = {
  [ELITE_ROW]: { label: 'ELITE FOUR & CHAMPION', note: 'Champion may have one Mega/Gigantamax' },
  [BOSS_ROW]: { label: 'ENDGAME BOSS TEAM', note: 'may also include one minor Legendary' },
};

function rowTop(row: number): number {
  let top = PAD_Y + BAND_H;
  for (let r = 1; r < row; r++) {
    top += ROW_H;
    if (BAND_BEFORE[r + 1]) top += BAND_H;
  }
  return top;
}

/** Left/width for a slot spanning columns colFrom..colTo (1-based). */
function slotX(colFrom: number, colTo: number) {
  const col = `((100% - ${2 * PAD_X}rem) / 7)`;
  return {
    left: `calc(${PAD_X}rem + ${colFrom - 1} * ${col} + ${INSET_X}rem)`,
    width: `calc(${colTo - colFrom + 1} * ${col} - ${2 * INSET_X}rem)`,
  };
}

function Band({ label, note }: { label: string; note?: string }) {
  return (
    <div
      className="mx-[0.1875rem] flex items-center gap-[0.3125rem] rounded-[0.3125rem] px-2 text-white"
      style={{ height: `${BAND_H}rem`, background: 'var(--lg-band)' }}
    >
      <b className="whitespace-nowrap text-[0.5625rem] font-extrabold tracking-[0.07em]">{label}</b>
      {/* Same size and leading as the label, so the two sit on one baseline
          inside the centred band. */}
      {note && <span className="overflow-hidden whitespace-nowrap text-[0.5625rem] opacity-85">{note}</span>}
    </div>
  );
}

function GlyphCell({ row, span, cell }: { row: number; span: number; cell: string }) {
  let inner: React.ReactNode;
  if (row === 1) {
    inner = (
      <span className="flex flex-col items-center gap-[3px]">
        <span className="text-[0.59375rem] font-semibold text-white">No badges</span>
        <GymBadges n={1} size={8} />
      </span>
    );
  } else if (row <= 8) inner = <GymBadges n={row} />;
  else if (row === ELITE_ROW) inner = <Stars n={4} />;
  else if (row === CHAMPION_ROW) inner = <Crown />;
  else inner = <BossBall cell={cell} />;
  return (
    <div
      className={cn('mx-[0.1875rem] flex items-center justify-center self-center rounded-md', span === 2 && 'col-span-2')}
      style={{ height: `${ROW_H - 2 * INSET_Y}rem`, background: 'var(--lg-cell)' }}
    >
      {inner}
    </div>
  );
}

interface CellDatum {
  row: number;
  seat: number;
  stage: number;
  isLegend: boolean;
  filled: boolean;
  /** What the cell draws, so a drag can carry a copy of it. */
  pokemonId: number | null;
}

/**
 * A vertical drag is a shelf-handle paint over one column's stage runs.
 * Grabbing a run's top edge moves that stage's own boundary; the bottom
 * edge moves the next stage's. A mid-run grab is inert until the pointer
 * crosses the run's original edge, then continues as that edge's handle —
 * so releasing mid-run changes nothing. Every move applies to the store
 * immediately; a snapshot restores the line if the gesture turns into a
 * column reorder instead.
 */
type PaintRole = 'top' | 'bottom' | 'mid' | 'edge';

interface PaintDrag {
  legend: boolean;
  seat: number;
  stage: number;
  startRow: number;
  role: PaintRole;
  runTop: number;
  runBottom: number;
  canTop: boolean;
  canBottom: boolean;
  initial: number[];
  painted: boolean;
  /**
   * The gesture has displaced another column at least once.
   *
   * It stays true for the rest of the drag, including the leg that brings the
   * column home. A drag that has moved sideways is a reorder, and a reorder
   * that ends where it started is a reorder that changed nothing — not a
   * vertical paint that happens to share its last frame.
   */
  reordered: boolean;
}

/**
 * While a legendary is in hand, the boss row is chosen by column alone.
 *
 * The default hit test wants the pointer over the cell, which puts a thumb
 * on top of the very Pokémon the outline is trying to point at. Matching on
 * x lets the drag be held below the row and still say what it would replace.
 */
const bossRowByColumn: CollisionDetection = (args) => {
  const x = args.pointerCoordinates?.x ?? args.collisionRect.left + args.collisionRect.width / 2;
  let best: (typeof args.droppableContainers)[number] | null = null;
  let bestDistance = Infinity;
  for (const container of args.droppableContainers) {
    const datum = container.data.current as CellDatum | undefined;
    if (!datum || datum.row !== BOSS_ROW) continue;
    const rect = container.rect.current;
    if (!rect) continue;
    const distance = Math.abs(rect.left + rect.width / 2 - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = container;
    }
  }
  return best ? [{ id: best.id, data: { droppableContainer: best, value: bestDistance } }] : [];
};

/**
 * The face a drag lifts off the card: the grabbed cell, as it paints.
 *
 * The copy in hand is portalled out of the card's CSS `zoom`, so it has to be
 * sized from what the cell paints rather than from what it declares. dnd-kit's
 * own rect cannot answer that twice over: it is the unzoomed layout box, and
 * it is still null while `onDragStart` runs.
 *
 * The corner is read off the cell rather than restated, because `rounded-md`
 * is a theme token whose value moves with the root font size — hard-coding it
 * gave a 5px corner where the desktop card paints 8px.
 */
function grabbedCellFace(activatorEvent: Event): {
  width: number;
  height: number;
  radius: number;
  /** One of the card's rem, in the portal's pixels. */
  rem: number;
} | null {
  const target = activatorEvent.target;
  const cell = target instanceof Element ? target.closest('[data-testid^="card-cell-"]') : null;
  if (!cell) return null;
  const box = cell.getBoundingClientRect();
  const style = getComputedStyle(cell);
  // The card's zoom, from the one element that carries both numbers: the
  // painted height and the layout height it came from.
  const zoom = box.height / (parseFloat(style.height) || box.height);
  return {
    width: box.width,
    height: box.height,
    radius: parseFloat(style.borderTopLeftRadius) * zoom,
    rem: box.height / (ROW_H - 2 * INSET_Y),
  };
}

/** A powerup form's sprite: the form's own id is its filename. */
function formSprite(form: PowerupForm): string {
  return `/sprites/pokemon/${form.id}.png`;
}

function PokemonCell({ cardIndex, datum, pokemonId, form, powerupKind, onPowerup, held, ringWhenOver, onRemove, removeLabel, onReset }: {
  cardIndex: number;
  datum: CellDatum;
  pokemonId: number | null;
  /** The Mega or Gigantamax this cell is currently wearing, if any. */
  form: PowerupForm | null;
  /** Which powerup this cell's Pokémon is currently using. */
  powerupKind: PowerupKind | null;
  /** Press a powerup button. Absent on rows that do not allow them. */
  onPowerup?: (kind: PowerupKind) => void;
  /** Part of the column being carried; it recedes where it is drawn. */
  held: boolean;
  /** A legendary drag is in flight; boss-row cells ring under the pointer. */
  ringWhenOver: boolean;
  /** Set on the column's topmost pokemon: remove this evo line. */
  onRemove?: () => void;
  /** What that control says it removes. */
  removeLabel?: string;
  /** Set on the topmost pokemon of a line whose evolution rows were dragged. */
  onReset?: () => void;
}) {
  const id = `cell-${datum.row}-${datum.seat}`;
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id,
    data: datum as unknown as Record<string, unknown>,
    disabled: !datum.filled,
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${datum.row}-${datum.seat}`,
    data: datum as unknown as Record<string, unknown>,
  });
  const pokemon = pokemonId !== null ? getPokemonById(pokemonId) : undefined;

  const onTap = () => {
    if (!datum.filled) {
      openLeagueBrowser(cardIndex, 'lines');
    } else if (datum.row === BOSS_ROW) {
      // The hint under the card: tap a boss-row pokemon to swap in a legendary.
      openLeagueBrowser(cardIndex, 'legend', datum.seat);
    } else if (pokemonId !== null) {
      // Anywhere else, a placed pokemon offers to swap its line out. The
      // seat keeps its place; only what sits in it changes.
      openLeagueBrowser(cardIndex, 'replace', datum.seat, pokemonId);
    }
  };

  // Boundary paints repaint cells in place; a ring marks a target only for
  // the legendary retarget, whose drop is not previewable.
  const ringed = isOver && ringWhenOver && datum.row === BOSS_ROW;

  return (
    <div
      ref={setDropRef}
      className="relative flex h-full items-center justify-center"
    >
      {/* The carried column is not drawn twice. The seat under it opens, and
          the column itself lifts off the card at full strength — so the copy
          in hand IS the preview, at the size and placement its new seat
          gives it. A faded copy in the seat plus a stack under the thumb
          showed the same line twice, and neither one clearly. */}
      {held && (
        <div
          data-seat-open
          aria-hidden
          className="absolute rounded-md border-[1.5px] border-dashed"
          style={{
            width: `calc(100% - ${2 * INSET_X}rem)`,
            height: `${ROW_H - 2 * INSET_Y}rem`,
            borderColor: 'var(--lg-dash)',
            background: 'rgba(15,23,42,0.035)',
          }}
        />
      )}
      <button
        type="button"
        ref={setDragRef}
        // Drag listeners and ARIA only where a drag is actually offered — a
        // disabled draggable spreads aria-disabled, which reads (and tests)
        // as an unclickable control.
        {...(datum.filled ? listeners : undefined)}
        {...(datum.filled ? attributes : undefined)}
        data-testid={`card-cell-${datum.row}-${datum.seat}`}
        onClick={onTap}
        className={cn(
          'relative flex items-center justify-center rounded-md',
          datum.filled && 'cursor-grab active:cursor-grabbing',
          ringed && 'ring-2 ring-[var(--lg-cell)]',
        )}
        style={{
          width: `calc(100% - ${2 * INSET_X}rem)`,
          height: `${ROW_H - 2 * INSET_Y}rem`,
          background: 'var(--lg-slot)',
          // Not `none`. `touch-action: none` hands every touch on this cell to
          // the app, which takes the browser's own gestures with it — a pinch
          // that starts over a cell does nothing, and the cells are most of
          // the card. The drag no longer needs it: a touch has to press and
          // hold before the sensor claims the gesture, so a pinch is over
          // before there is anything to claim. Same value the dex builder's
          // grid settled on.
          touchAction: 'pan-y pinch-zoom',
          ...(held
            ? {
                transform: `translateY(-${CELL_LIFT_REM}rem)`,
                boxShadow: '0 0.5rem 1rem rgba(15,23,42,0.28)',
                zIndex: 20,
              }
            : null),
        }}
      >
        {pokemon ? (
          <img
            src={form ? formSprite(form) : pokemon.sprite}
            alt={form ? form.label : pokemon.name}
            className="pointer-events-none max-w-none"
            style={{ width: `${SPRITE_REM}rem`, height: `${SPRITE_REM}rem`, imageRendering: 'pixelated' }}
          />
        ) : (
          <EmptySlotBall />
        )}
      </button>
      {/* Mega bottom-left, Dynamax bottom-right, on the rows that allow a
          powerup and only for Pokémon that have one. Pressing cycles that
          Pokémon's forms and then returns to base, which is what lets one
          button carry Charizard's two Megas. `SLACK` decides where each disc
          sits and how far a press reaches. */}
      {onPowerup && pokemon && (
        <>
          {formsFor(pokemon.id, 'mega').length > 0 && (
            <PowerupButton
              kind="mega"
              active={powerupKind === 'mega'}
              onPress={() => onPowerup('mega')}
              side="left"
            />
          )}
          {formsFor(pokemon.id, 'dynamax').length > 0 && (
            <PowerupButton
              kind="dynamax"
              active={powerupKind === 'dynamax'}
              onPress={() => onPowerup('dynamax')}
              side="right"
            />
          )}
        </>
      )}
      {onReset && pokemon && (
        <button
          type="button"
          aria-label={`Reset ${pokemon.name}'s evolution rows`}
          onClick={(e) => {
            e.stopPropagation();
            onReset();
          }}
          // The opposite corner from the remove X, so the destructive control
          // and the undo one never sit under the same thumb.
          //
          // `contain:paint` for the same reason the powerup discs have it:
          // the card scales itself with CSS `zoom`, so this box is a
          // fractional number of pixels and its painted edges snap
          // independently. The disc came out an ellipse and the arrow inside
          // it sat up and to the left, even though both are centred to the
          // pixel in layout.
          className="absolute left-0 top-[0.175rem] z-[15] h-[0.95rem] w-[0.95rem] cursor-pointer rounded-full bg-[#2563eb] [contain:paint]"
        >
          {/* Centred by having nothing to centre.
              The card scales itself with CSS `zoom`, so the disc and a smaller
              mark inside it are both a fractional number of pixels, and the
              leftover space either side does not round the same way: measured
              at dpr 10, a flex-centred mark sat 2.0% left of the disc's
              centre, and a transform-centred one 3.3% left. Both divide a
              gap. This leaves no gap — the svg fills the disc, and the icon's
              own 24-unit ink is inset by padding its viewBox, so the ink's
              centre and the disc's are the same point by construction.
              `strokeWidth` is in viewBox units, so it scales with the pad.
              The half-unit on the origin is the glyph's own bias, measured
              rather than guessed: `RotateCcw` carries its arrowhead outside
              the ring on the top-left, so its painted ink sits 1.3% up and
              left of the 24-unit box it is drawn in. */}
          <RotateCcw
            viewBox="-7.5 -7.5 38 38"
            className="absolute inset-0 h-full w-full text-white"
            strokeWidth={4}
          />
        </button>
      )}
      {onRemove && pokemon && (
        <button
          type="button"
          aria-label={removeLabel ?? `Remove ${pokemon.name}'s line`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-0 top-[0.175rem] z-[15] h-[0.95rem] w-[0.95rem] cursor-pointer [contain:paint]"
        >
          <RedXIcon className="h-full w-full" />
        </button>
      )}
    </div>
  );
}

/**
 * How much of the disc each symbol takes.
 *
 * Both are `object-contain` in a square box, so what reaches the eye is the
 * art's own ink, and the two arts are shaped very differently. Measured:
 * `mega.png` is 56x74 and its ink reaches every edge, so its height binds.
 * `dynamax.png` is square but its ink fills 96% of the width and 77% of the
 * height, so its width binds.
 *
 * One shared percentage cannot serve both. Too small and the Dynamax symbol
 * reads a fifth smaller than the Mega one; too large and its ink runs to the
 * left and right rims with clear space above and below, which reads as a
 * circle squashed sideways. Sizing each symbol so its *widest* side takes
 * the same share of the disc gives both the same margin all round.
 */

/** The widest side of a symbol's ink, as a share of its own image box. */
const SYMBOL_INK: Record<PowerupKind, number> = { mega: 1, dynamax: 0.961 };

/** How much of the disc that widest side may take. */
const SYMBOL_EXTENT = 0.8;

function symbolScale(kind: PowerupKind): string {
  return `${((SYMBOL_EXTENT / SYMBOL_INK[kind]) * 100).toFixed(1)}%`;
}

/** The disc's diameter. Every other powerup measure derives from it. */
const DISC_REM = 1;

/** How far above and below the disc a press still counts. */
const HIT_UP_REM = 0.5;
const HIT_DOWN_REM = 0.125;

/**
 * The width a cell has left once both discs are drawn.
 *
 * A disc has two neighbours: the cell's other button, and the next seat's
 * across the column boundary. Splitting the slack four ways sits each disc
 * exactly midway between them at any width, which is the only rule that
 * holds — the column is a share of the viewport while the disc is rem, so
 * the two drift apart as the window changes. Measured with a fixed 0.375rem
 * inset: 11.1px of clearance at 430px, and at 320px the two discs in a cell
 * overlapped by 1.8px.
 */
const SLACK = `(100% - ${2 * DISC_REM}rem)`;

/**
 * The press box: the disc plus half the slack, centred on it.
 *
 * A 1rem target sits beside a tap that opens the line picker, so a press a
 * little wide of Dynamax offered to replace the whole evolution line. The
 * box is larger than the paint, and takes half the room rather than all of
 * it, so two press boxes are still as clear of each other as two discs.
 * Upward is the generous direction because the row has room there, and what
 * it takes is the cell's own tap — the mis-tap being prevented.
 */
const HIT_INSET = `calc(${SLACK} / 8)`;
const HIT_WIDTH = `calc(${DISC_REM}rem + ${SLACK} / 4)`;
const HIT_HEIGHT = `${DISC_REM + HIT_UP_REM + HIT_DOWN_REM}rem`;

/** One corner button: a press box, with the disc drawn at the bottom of it. */
function PowerupButton({ kind, active, onPress, side }: {
  kind: PowerupKind;
  active: boolean;
  onPress: () => void;
  /** Mega takes the cell's left corner, Dynamax its right. */
  side: 'left' | 'right';
}) {
  return (
    <button
      type="button"
      aria-label={kind === 'mega' ? 'Mega Evolution' : 'Dynamax'}
      aria-pressed={active}
      data-powerup={kind}
      data-active={active ? 'true' : 'false'}
      onClick={(e) => {
        e.stopPropagation();
        onPress();
      }}
      // A press here is not a drag. The press box makes a wider dead zone for
      // the column drag, which still starts anywhere else on the cell.
      onPointerDown={(e) => e.stopPropagation()}
      className="absolute bottom-0 z-[15] flex cursor-pointer items-end justify-center"
      style={{
        [side]: HIT_INSET,
        width: HIT_WIDTH,
        height: HIT_HEIGHT,
        paddingBottom: `${HIT_DOWN_REM}rem`,
      }}
    >
      {/* Always a white disc: the symbols are fine art at poster size and
          mush at 15px on top of a sprite. The disc gives them a ground, and
          the ring — not the opacity — carries the on state, so an available
          powerup stays legible while an active one is unmistakable.

          `contain:paint` is what keeps the disc round. The card scales itself
          with CSS `zoom`, so a 1rem box is a fractional number of CSS pixels
          and the painted rect snaps its edges independently: this disc
          measured 15px wide by 16px tall and `rounded-full` drew that as an
          ellipse. Paint containment gives the element its own paint context,
          which rasterises at subpixel precision. Measured, both ways: 240x256
          without it, 256x256 with it. */}
      <span
        data-powerup-disc
        className={cn(
          'flex items-center justify-center rounded-full bg-white transition-shadow [contain:paint]',
          active ? 'ring-2 ring-[var(--lg-band)] shadow' : 'ring-1 ring-black/15',
        )}
        style={{ width: `${DISC_REM}rem`, height: `${DISC_REM}rem` }}
      >
        {/* The disc stays opaque so the symbol always has a ground; the
            symbol itself dims when the powerup is merely available. */}
        <img
          src={`/powerups/${kind}.png`}
          alt=""
          className={cn('object-contain transition-opacity', !active && 'opacity-55')}
          style={{ width: symbolScale(kind), height: symbolScale(kind) }}
        />
      </span>
    </button>
  );
}

/**
 * One half of the ace/partner slot: heading, sprite, name.
 *
 * The empty state is the filled state with the sprite taken out and its square
 * left in place, so the heading and the name keep the position they have once
 * a Pokemon lands there. Drawing the ring on its own moves the word up against
 * it, which is a different layout wearing the same name.
 */
function SlotHalf({
  place, testId, half, heading, headingBelow, pokemon, nameClass,
  headClass, onPick,
}: {
  place: Placed | null;
  testId: string;
  half: 'ace' | 'partner';
  heading: string;
  headingBelow: boolean;
  pokemon: ReturnType<typeof getPokemonById>;
  nameClass: string;
  headClass: string;
  onPick: () => void;
}) {
  const label = (
    // One line, always. A wrapped heading costs a line the geometry does not
    // budget for, and it costs it in the filled state only.
    <span className={cn('whitespace-nowrap', headClass)} style={{ color: 'var(--lg-band)' }}>
      {heading}
    </span>
  );
  const size = place ? `${place.sprite}px` : '0px';
  const lab = useSlotLab((st) => st.enabled);
  const slot = useSlotLab((st) => st.slot);
  const shift = useSlotLab((st) => st[half]);
  const nudge = useSlotLab((st) => st.nudge);
  const dragged = useRef(false);
  // The stored offset is a fraction of the slot, so it means the same thing on
  // a phone and a desktop; it becomes pixels only here, against the slot this
  // card actually has.
  const offset = slot ? { x: shift.dx * slot.w, y: shift.dy * slot.h } : { x: 0, y: 0 };

  const onLabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!slot) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragged.current = false;
    const from = { x: e.clientX, y: e.clientY };
    // The card is scaled by CSS `zoom`, so a pointer moves more screen pixels
    // than it does card pixels. Dividing by the slot's own scale keeps the
    // half under the finger instead of running ahead of it.
    const rect = el.getBoundingClientRect();
    const scale = rect.width > 0 && place ? rect.width / place.width : 1;
    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - from.x) / scale;
      const dy = (ev.clientY - from.y) / scale;
      if (Math.hypot(dx, dy) > 3) dragged.current = true;
      from.x = ev.clientX;
      from.y = ev.clientY;
      nudge(half, dx / slot.w, dy / slot.h);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      // Let the click that follows see the flag, then clear it.
      setTimeout(() => { dragged.current = false; }, 0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const body = pokemon ? (
    <>
      <img
        src={pokemon.sprite}
        alt={pokemon.name}
        className="max-w-none shrink-0"
        style={{ width: size, height: size, imageRendering: 'pixelated' }}
      />
      <span className={cn('leading-tight', nameClass)}>
        {pokemonLabel(pokemon.id, pokemon.name).name}
      </span>
    </>
  ) : (
    <>
      <span
        className="flex shrink-0 items-center justify-center"
        style={{ width: size, height: size }}
      >
        <span
          className="rounded-full border border-dashed"
          style={{ width: '62%', aspectRatio: '1', borderColor: 'var(--lg-dash)' }}
        />
      </span>
      {/* Blank, but it still takes its line: that is what holds the heading
          where it sits once a Pokemon is chosen. */}
      <span className={cn('leading-tight', nameClass)}>&nbsp;</span>
    </>
  );
  return (
    <button
      type="button"
      onClick={(e) => {
        // In the lab a press that travelled was a drag, not a tap. Everywhere
        // else `dragged` is never set and this is the plain button it was.
        if (dragged.current) {
          e.preventDefault();
          return;
        }
        onPick();
      }}
      onPointerDown={lab ? onLabPointerDown : undefined}
      data-testid={testId}
      data-slot-half={half}
      aria-label={pokemon ? `${heading}: ${pokemon.name}` : `Choose a ${heading.toLowerCase()}`}
      className={cn(
        'absolute z-[6] flex flex-col items-center text-center',
        lab && 'cursor-grab touch-none rounded outline-dashed outline-1 outline-offset-2',
      )}
      style={{
        left: `${(place?.left ?? 0) + offset.x}px`,
        top: `${(place?.top ?? 0) + offset.y}px`,
        width: `${place?.width ?? 0}px`,
        visibility: place ? undefined : 'hidden',
        outlineColor: lab ? 'rgba(37,99,235,0.5)' : undefined,
      }}
    >
      {headingBelow ? <>{body}{label}</> : <>{label}{body}</>}
    </button>
  );
}

const ACE_HEAD = 'ACE POKÉMON';
const PARTNER_HEAD = 'PARTNER';
const HEAD_CLASS = 'text-[0.53125rem] font-extrabold tracking-[0.08em] leading-[1.4]';
const ACE_NAME_CLASS = 'text-[0.8125rem] font-medium';
const PARTNER_NAME_CLASS = 'text-[0.8125rem] font-medium';

/**
 * Measure the slot, then solve both halves against what it actually is.
 *
 * The run sizes come from the DOM rather than from constants: the heading and
 * the name are text, so their widths follow the font, the language and the
 * root font size, none of which this file gets to decide. A hidden copy of
 * each run is measured once per resize and handed to the solver.
 */
function useSlotLayout(ref: React.RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<{ ace: Placed; partner: Placed } | null>(null);
  const version = useNamesVersion();
  // The lab's size is an input to the solve, so a change to it has to
  // re-measure. Nothing else reads it, and on the card it never changes.
  const labSprite = useSlotLab((s) => (s.enabled ? s.sprite : 0));
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // The card scales itself to fit the viewport's height, and that scale is
    // recomputed from the card's own measured height. An observer that sets
    // state on every fire joins that loop: re-render, re-measure, re-scale,
    // fire again — and on a narrow screen, where the fit is already at its
    // floor, it never settles. Nothing here is worth sub-pixel precision, so
    // the box is rounded and an unchanged box does no work at all.
    let last = '';
    const measure = () => {
      const box = el.getBoundingClientRect();
      const probe = el.querySelector<HTMLElement>('[data-slot-probe]');
      if (!probe || box.width < 8 || box.height < 8) return;
      const w = Math.round(box.width);
      const h = Math.round(box.height);
      const run = (sel: string): [number, number] => {
        const r = probe.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
        return [r.width, r.height];
      };
      const ace: Runs = { head: run('[data-probe="ace-head"]'), name: run('[data-probe="ace-name"]'), headFirst: true };
      const partner: Runs = { head: run('[data-probe="partner-head"]'), name: run('[data-probe="partner-name"]'), headFirst: false };
      // The key covers the text as well as the box. Keying on the box alone
      // meant the first measurement — taken before the webfont had swapped —
      // was the only one that ever ran: the box never changed afterwards, so
      // the placement stayed solved for metrics the card no longer had, and
      // the partner ended up 18px through the seam on a desktop slot.
      const key = [w, h, ace.head, ace.name, partner.head, partner.name].join('|');
      if (key === last) return;
      last = key;
      // The lab picks the size by hand; the card solves for it.
      const lab = useSlotLab.getState();
      const sprite = lab.enabled ? lab.sprite : sharedSprite(w, h, ace, partner);
      // A hand-picked size is meant to be tried before it is known to fit, so
      // the lab falls back to a corner rather than to nothing — a half that
      // answers by disappearing cannot be dragged anywhere.
      const a = placeHalf(w, h, sprite, ace, true)
        ?? (lab.enabled ? placeFree(w, h, sprite, ace, true) : null);
      const p = placeHalf(w, h, sprite, partner, false)
        ?? (lab.enabled ? placeFree(w, h, sprite, partner, false) : null);
      if (a && p) setLayout({ ace: a, partner: p });
      // The lab reads offsets as fractions of the slot, so it needs the slot.
      // Setting it always costs one shallow compare; the store ignores a
      // repeat of the same size.
      useSlotLab.getState().setSlot(w, h);
    };
    measure();
    // A ResizeObserver is not enough on its own. The card is scaled by CSS
    // `zoom` on an ancestor, and that changes the box this slot *renders* at
    // without resizing the slot in its own coordinate space — so the observer
    // stays silent while the geometry underneath it moves, and the placement
    // keeps answering to a box the card no longer has. Re-checking for a few
    // frames after mount catches the fit settling; the key guard above means
    // a frame where nothing moved costs one rect read.
    let frames = 0;
    let raf = 0;
    const settle = () => {
      measure();
      if (++frames < 30) raf = requestAnimationFrame(settle);
    };
    raf = requestAnimationFrame(settle);
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref, version, labSprite]);
  return layout;
}

function AcePartnerSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  // `pokemonLabel` reads the name store without subscribing to it, so the
  // slot has to subscribe itself. Without this the name under the sprite did
  // not follow a language change.
  useNamesVersion();
  const { card } = view;
  const line = card.signatureSeat !== null ? card.lines[card.signatureSeat - 1] : undefined;
  const shown = signatureMember(line, card.signatureId ?? null);
  const ace = shown !== null ? getPokemonById(shown) : undefined;
  const partner = card.partnerId != null ? getPokemonById(card.partnerId) : undefined;
  const slotRef = useRef<HTMLDivElement>(null);
  const layout = useSlotLayout(slotRef);
  const pos = {
    ...slotX(1, 3),
    top: `${rowTop(1) + INSET_Y}rem`,
    height: `${4 * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <div
      ref={slotRef}
      className={cn('absolute z-[5] rounded-lg', ace || partner ? undefined : 'border border-dashed')}
      style={{
        ...pos,
        borderColor: ace || partner ? undefined : 'var(--lg-dash)',
        background: ace || partner ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {/* The four text runs the solver needs the size of, drawn once and never
          shown. Measuring them beats assuming them: they are text, so their
          widths move with the font, the language and the root font size. */}
      <span
        data-slot-probe
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        <span data-probe="ace-head" className={cn('inline-block', HEAD_CLASS)}>{ACE_HEAD}</span>
        <span data-probe="ace-name" className={cn('inline-block leading-tight', ACE_NAME_CLASS)}>
          {ace ? pokemonLabel(ace.id, ace.name).name : '\u00a0'}
        </span>
        <span data-probe="partner-head" className={cn('inline-block', HEAD_CLASS)}>{PARTNER_HEAD}</span>
        <span data-probe="partner-name" className={cn('inline-block leading-tight', PARTNER_NAME_CLASS)}>
          {partner ? pokemonLabel(partner.id, partner.name).name : '\u00a0'}
        </span>
      </span>
      {/* The seam is a drawn line, not a wall: a block's far corner is allowed
          a few pixels past it, because that corner holds a sprite's
          transparent margin rather than any ink. */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <line
          x1="100"
          y1={SEAM_RIGHT * 100}
          x2="0"
          y2="100"
          stroke="var(--lg-dash)"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <SlotHalf
        place={layout?.ace ?? null}
        testId="slot-ace"
        half="ace"
        heading={ACE_HEAD}
        headingBelow={false}
        pokemon={ace}
        nameClass={ACE_NAME_CLASS}
        headClass={HEAD_CLASS}
        onPick={() => openLeagueBrowser(cardIndex, 'signature')}
      />
      <SlotHalf
        place={layout?.partner ?? null}
        testId="slot-partner"
        half="partner"
        heading={PARTNER_HEAD}
        headingBelow
        pokemon={partner}
        nameClass={PARTNER_NAME_CLASS}
        headClass={HEAD_CLASS}
        onPick={() => openLeagueBrowser(cardIndex, 'partner')}
      />
    </div>
  );
}

/**
 * The TM and the badge are one pair, so they are built from one set of
 * numbers.
 *
 * Each takes a row and a half of the three that rows 5 to 7 give them, and
 * each puts its glyph and the word under it in a fixed-width column on the
 * left with the text beside it. Sharing the column width is what makes the
 * disc and the hexagon line up, and the two words under them line up in turn
 * — the alternative is two independently centred stacks that agree only by
 * accident.
 */
const MARK_ROWS = 1.5;
/**
 * The glyph column, capped as a share of the box.
 *
 * A fixed rem width is wrong here: the box is two of the card's seven columns
 * and the card's width is not fixed, so at a 320px viewport a 2.75rem column
 * took most of the box and the badge name was down to two characters. The cap
 * keeps the glyph from eating the text it labels; both slots use the same
 * expression, so the disc and the hexagon stay on one axis whatever binds.
 */
const MARK_COL = 'min(2.75rem, 30%)';
// A share of the column, not of the box. A percentage inside the column
// resolves against the column, so repeating the box fraction here multiplies
// the two and collapses the glyph to a few pixels.
const MARK_GLYPH = '72%';
const MARK_LABEL_CLASS = 'text-[0.5rem] font-extrabold tracking-[0.06em]';

function TmSlot({ view }: { view: CardView }) {
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const move = view.card.tmMoveId !== null ? getMoveById(view.card.tmMoveId) : undefined;
  const pos = {
    ...slotX(1, 2),
    top: `${rowTop(5) + INSET_Y}rem`,
    height: `${MARK_ROWS * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <button
      type="button"
      onClick={() => setMovePickerOpen(true)}
      data-testid="slot-tm"
      className={cn('absolute z-[5] flex items-center gap-[0.375rem] rounded-lg pl-[0.375rem]', !move && 'border border-dashed')}
      style={{ ...pos, borderColor: move ? undefined : 'var(--lg-dash)', background: move ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)' }}
    >
      <span
        className="flex shrink-0 flex-col items-center"
        style={{ width: MARK_COL }}
      >
        {/* The disc wears the move's own type, not the gym's — a TM is the
            move, and the gym's colour is already the whole card. Empty, it
            matches the badge hexagon's stroke rather than the cell fill. */}
        {/* The disc takes the column's width so it tracks the same cap. */}
        <span className="w-full" style={{ aspectRatio: '1', maxWidth: MARK_GLYPH }}>
          <TmDisc colour={move ? TYPE_COLORS[move.type] : 'var(--lg-dash)'} size="100%" />
        </span>
        {/* The disc's viewBox carries its own padding, so the label is pulled
            back up against it. */}
        {/* The word wears the move's type too. A TM is the move, and the
            card's own colour is already everywhere else on the card. */}
        <span
          className={cn('-mt-[0.0625rem]', MARK_LABEL_CLASS)}
          style={{ color: move ? TYPE_COLORS[move.type] : 'var(--lg-hint)' }}
        >
          TM
        </span>
      </span>
      {move ? (
        <span className="flex min-w-0 flex-col items-start gap-[2px]">
          <span className="flex items-center gap-[3px]">
            <TypeBadge type={move.type} className="w-[2.75rem]" />
            <CategoryChip category={move.category} className="h-[0.6875rem] w-[0.9375rem] rounded-[4px] border" />
          </span>
          <span className="min-w-0 text-left text-[0.6875rem] leading-[1.15]">{move.name}</span>
        </span>
      ) : (
        <span className="min-w-0 text-left text-[0.6875rem] leading-[1.15]" style={{ color: 'var(--lg-hint)' }}>
          Pick a move
        </span>
      )}
    </button>
  );
}

/**
 * The badge slot: a hexagon and the badge's name.
 *
 * "Badge" is part of the text, not a caption under it, so a name reads as the
 * phrase it is — "Thunder Badge" — and the word follows the name onto the
 * second line when the name is long. That rules an `<input>` out: an input is
 * a replaced element, so its text neither wraps nor flows with a sibling
 * word. A contenteditable span does both, in one text flow, which is also why
 * there is nothing here to keep in sync with a mirror.
 *
 * The length limit is the box, not a guessed number of characters: 40 wide
 * letters and 40 narrow ones do not occupy the same space, so a single cap is
 * either too tight for one or lets the other overflow. Every edit is measured
 * against the room the slot has and rejected if it does not fit, with a hard
 * ceiling behind it so a paste cannot put a novel in the store.
 */
const BADGE_NAME_CEILING = 60;

function BadgeSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const setBadgeName = useLeagueStore((s) => s.setBadgeName);
  const fieldRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const accepted = useRef(view.card.badgeName);
  const name = view.card.badgeName;
  const pos = {
    ...slotX(1, 2),
    top: `${rowTop(5) + MARK_ROWS * ROW_H + INSET_Y}rem`,
    height: `${MARK_ROWS * ROW_H - 2 * INSET_Y}rem`,
  };

  // The field owns its own text, so React never re-renders it — that would
  // drop the caret on every keystroke. Writing to it while it has focus is
  // the same bug by another route, so this only ever catches the field up to
  // a change made elsewhere: opening a different card, or a reset.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== name) el.textContent = name;
    accepted.current = name;
  }, [name]);

  const putCaretAtEnd = () => {
    const el = fieldRef.current;
    if (!el) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const onInput = () => {
    const el = fieldRef.current;
    const box = textRef.current;
    if (!el || !box) return;
    // Stored exactly as the field holds it. Normalizing here — collapsing
    // runs of space, say — makes the store and the DOM disagree on the very
    // next render, and the only way to reconcile that is to rewrite the
    // field, which throws the caret back to the start. A browser inserts a
    // non-breaking space for a trailing one, so a normalizing field
    // scrambles its own text the moment you type two words.
    const next = el.textContent ?? '';
    // The suffix is already in the box by the second character, so the box
    // measures the phrase the reader will see, not just the name.
    const fits = next.length <= BADGE_NAME_CEILING && box.scrollHeight <= box.clientHeight + 1;
    if (!fits) {
      el.textContent = accepted.current;
      putCaretAtEnd();
      return;
    }
    accepted.current = next;
    setBadgeName(cardIndex, next);
  };

  return (
    <div
      // The whole slot starts text entry — the hexagon is as tappable as
      // the field itself.
      onClick={() => {
        fieldRef.current?.focus();
        putCaretAtEnd();
      }}
      data-testid="slot-badge"
      className={cn('absolute z-[5] flex cursor-text items-center gap-[0.375rem] rounded-lg pl-[0.375rem]', !name && 'border border-dashed')}
      style={{ ...pos, borderColor: name ? undefined : 'var(--lg-dash)', background: name ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)' }}
    >
      {/* The same column the TM slot uses, so the hexagon sits under the disc
          and the word under the word. */}
      <span
        className="flex shrink-0 flex-col items-center"
        style={{ width: MARK_COL }}
      >
        <svg viewBox="0 0 32 32" className="w-full" style={{ aspectRatio: '1', maxWidth: MARK_GLYPH }}>
          <path
            d="M16 3 L27 9.5 L27 22.5 L16 29 L5 22.5 L5 9.5 Z"
            fill={name ? 'var(--lg-cell)' : 'none'}
            stroke={name ? 'none' : 'var(--lg-dash)'}
            strokeWidth="1.6"
            strokeDasharray={name ? undefined : '3 2.4'}
          />
          <circle cx="16" cy="16" r="4.4" fill={name ? '#ffffff' : 'none'} stroke={name ? 'none' : 'var(--lg-dash)'} strokeWidth="1.6" />
        </svg>
        <span
          className={cn('-mt-[0.0625rem]', MARK_LABEL_CLASS)}
          style={{ color: name ? 'var(--lg-band)' : 'var(--lg-hint)' }}
        >
          BADGE
        </span>
      </span>
      <div
        ref={textRef}
        // Three lines. The box is 1.5 rows -- 4.3125rem -- and three lines of
        // this size come to 2.46rem, so the height is not what limits the
        // name; the width beside the hexagon is. Capping at two lines threw
        // away a third of the room for nothing, and at a 320px viewport that
        // left six characters. The height is still fixed rather than free, so
        // `scrollHeight` has something to exceed and a name cannot grow past
        // the box.
        className="min-w-0 flex-1 overflow-hidden pr-[0.375rem] text-left text-[0.65625rem] leading-tight"
        style={{ maxHeight: `${3 * 0.65625 * 1.25}rem` }}
      >
        <span
          ref={fieldRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label="Badge name"
          spellCheck={false}
          onInput={onInput}
          // The placeholder is the field's own `::before` rather than a
          // sibling: an empty inline span is zero-wide, which leaves nothing
          // to tap and nowhere obvious for the caret to sit.
          data-badge-field
          data-placeholder="Badge Name"
          className="outline-none"
        />
        {name ? <span> Badge</span> : null}
      </div>
    </div>
  );
}

export function CardGrid({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const moveSeat = useLeagueStore((s) => s.moveSeat);
  const setStageBoundary = useLeagueStore((s) => s.setStageBoundary);
  const setLineBoundaries = useLeagueStore((s) => s.setLineBoundaries);
  const setLegend = useLeagueStore((s) => s.setLegend);
  const swapLegends = useLeagueStore((s) => s.swapLegends);
  const removeLineWith = useLeagueStore((s) => s.removeLineWith);
  const cyclePowerupOnCard = useLeagueStore((s) => s.cyclePowerup);
  const { card, shades, rows } = view;

  const sensors = useDragSensors();

  // Every sprite this card can put in a cell, warmed while the card is idle.
  //
  // A drag swaps `src` on cells that are already on screen, and a cell whose
  // new sprite is not in the browser yet keeps painting the old one — so the
  // column under the pointer reads as its previous tenant for as long as the
  // fetch takes. Measured on the built preview: a reorder revealed up to six
  // sprites the card had never shown, each one a cold cell.
  //
  // The set is every member of every line, not the ones the rows show today:
  // moving a line to a deeper seat, or dragging an evolution boundary, brings
  // in stages no row showed before. Powerup forms come too, because the
  // powerup rides its seat and a reorder hands it to another line.
  const warmable = card.lines
    .flatMap((line) => line.branch)
    .flatMap((id) => {
      const sprite = getPokemonById(id)?.sprite;
      const forms = [...formsFor(id, 'mega'), ...formsFor(id, 'dynamax')];
      return [...(sprite ? [sprite] : []), ...forms.map(formSprite)];
    })
    .join('|');
  useEffect(() => {
    warmImages(warmable.split('|').filter(Boolean));
  }, [warmable]);

  const paintRef = useRef<PaintDrag | null>(null);
  const [previewMove, setPreviewMove] = useState<{ from: number; to: number } | null>(null);
  const [legendDrag, setLegendDrag] = useState(false);
  // What the pointer carries, and how big to draw it. Every size is measured
  // from the cell it was lifted from, in client pixels, because the card sits
  // under a CSS `zoom` and the overlay is portalled out of it — a rem in the
  // portal is the root's rem, not the card's.
  const [held, setHeld] = useState<{
    ids: number[];
    sprite: number;
    /** The cell face the copy wears, in client pixels. */
    face: { width: number; height: number; radius: number; shadow: string };
  } | null>(null);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const d = e.active.data.current as CellDatum | undefined;
      if (!d) return;
      const cell = grabbedCellFace(e.activatorEvent);
      const rem = cell?.rem ?? 16;
      const sprite = SPRITE_REM * rem;
      // The same face a lifted cell wears: white, the cell's own corner, and
      // the lift shadow, so a copy in hand and a column in hand read as one
      // gesture. White is spelled out rather than read from `--lg-slot`,
      // which is set on the card and does not reach a portal.
      const face = {
        width: cell?.width ?? sprite,
        height: cell?.height ?? sprite,
        radius: cell?.radius ?? 0,
        shadow: `0 ${0.5 * rem}px ${rem}px rgba(15,23,42,0.28)`,
      };
      // A column drag carries the column: its line's members, stacked, which
      // is what the column holds however many rows it spans. A legendary
      // drag carries the one Pokémon it is.
      const grabbed = card.lines[d.seat - 1];
      if (d.isLegend) {
        setHeld({ ids: legendAt(card, d.seat) ? [legendAt(card, d.seat)!.pokemonId] : [], sprite, face });
      } else if (grabbed) {
        setHeld({ ids: grabbed.branch, sprite, face });
        // Held over its own seat is still held. Seeding the preview here is
        // what makes a press and hold say so before the column has gone
        // anywhere: without it the column looks untouched until it reaches
        // some *other* seat, so the gesture gives no sign it is ready.
        // `moveSeat` is a no-op when the two seats are the same, so nothing
        // moves — only the feedback appears.
        setPreviewMove({ from: d.seat, to: d.seat });
      }
      if (d.isLegend) {
        paintRef.current = {
          legend: true, seat: d.seat, stage: 0, startRow: d.row, role: 'mid',
          runTop: d.row, runBottom: d.row, canTop: false, canBottom: false,
          reordered: false,
          initial: [], painted: false,
        };
        setLegendDrag(true);
        return;
      }
      const line = card.lines[d.seat - 1];
      if (!line) return;
      const stage = stageAt(line, d.row);
      // The run's original extent, scanned over visible rows — robust when
      // squeezed-out stages leave equal boundaries.
      const jr = joinRow(d.seat);
      let runTop = d.row;
      let runBottom = d.row;
      for (let r = d.row - 1; r >= jr; r--) {
        if (stageAt(line, r) === stage) runTop = r;
        else break;
      }
      for (let r = d.row + 1; r <= ROW_COUNT; r++) {
        if (stageAt(line, r) === stage) runBottom = r;
        else break;
      }
      const canTop = stage >= 1;
      const canBottom = stage <= line.branch.length - 2;
      let role: PaintRole = 'mid';
      if (d.row === runTop && d.row === runBottom) role = 'edge';
      else if (d.row === runTop && canTop) role = 'top';
      else if (d.row === runBottom && canBottom) role = 'bottom';
      paintRef.current = {
        legend: false, seat: d.seat, stage, startRow: d.row, role,
        runTop, runBottom, canTop, canBottom, reordered: false,
        initial: [...line.boundaries], painted: false,
      };
    },
    [card],
  );

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const p = paintRef.current;
      const over = e.over?.data.current as CellDatum | undefined;
      if (!p || p.legend || !over) return;
      if (over.seat !== p.seat) {
        // The gesture is a reorder: undo any paint, preview the target seats.
        p.reordered = true;
        if (p.painted) {
          setLineBoundaries(cardIndex, p.seat, p.initial);
          p.painted = false;
        }
        setPreviewMove((cur) =>
          cur && cur.to === over.seat ? cur : { from: p.seat, to: over.seat },
        );
        return;
      }
      // Back over its own seat: still held, just not moved. Clearing the
      // preview here would drop the picked-up look every time the column
      // passes over where it started.
      setPreviewMove((cur) =>
        cur && cur.from === p.seat && cur.to === p.seat ? cur : { from: p.seat, to: p.seat },
      );
      // Home again, after having pushed another column aside. The column goes
      // back where it started and nothing else happens: without this the
      // return leg falls through to the paint below and rewrites the line's
      // evolution stages, which is not what a cancelled reorder should do.
      if (p.reordered) return;
      let role = p.role;
      if (role === 'edge' && over.row !== p.startRow) {
        role = over.row < p.startRow
          ? (p.canTop ? 'top' : p.canBottom ? 'bottom' : 'mid')
          : (p.canBottom ? 'bottom' : p.canTop ? 'top' : 'mid');
        p.role = role;
      }
      if (role === 'mid') {
        // Inert until the pointer crosses the run's original edge.
        if (over.row <= p.runTop && p.canTop) p.role = role = 'top';
        else if (over.row >= p.runBottom && p.canBottom) p.role = role = 'bottom';
      }
      if (role === 'top') {
        setStageBoundary(cardIndex, p.seat, p.stage, over.row);
        p.painted = true;
      } else if (role === 'bottom') {
        setStageBoundary(cardIndex, p.seat, p.stage + 1, over.row + 1);
        p.painted = true;
      }
    },
    [cardIndex, setLineBoundaries, setStageBoundary],
  );

  const onDragCancel = useCallback(() => {
    const p = paintRef.current;
    paintRef.current = null;
    if (p && !p.legend && p.painted) setLineBoundaries(cardIndex, p.seat, p.initial);
    setPreviewMove(null);
    setLegendDrag(false);
    setHeld(null);
  }, [cardIndex, setLineBoundaries]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const p = paintRef.current;
      paintRef.current = null;
      setPreviewMove(null);
      setLegendDrag(false);
      setHeld(null);
      const to = e.over?.data.current as CellDatum | undefined;
      if (!p) return;
      if (p.legend) {
        const moving = legendAt(card, p.seat);
        if (to && to.row === BOSS_ROW && moving && to.seat !== p.seat) {
          // Onto a seat that already holds one, the two trade places; onto an
          // empty seat, it simply moves. Either way both legendaries survive
          // the gesture, which is the only reading that loses nothing.
          if (legendAt(card, to.seat)) swapLegends(cardIndex, p.seat, to.seat);
          else setLegend(cardIndex, { ...moving, seat: to.seat });
        }
        return;
      }
      if (to && to.seat !== p.seat) {
        if (p.painted) setLineBoundaries(cardIndex, p.seat, p.initial);
        moveSeat(cardIndex, p.seat, to.seat);
      }
      // Same seat: every paint already applied live, and an unpromoted
      // mid-run release touched nothing.
    },
    [card, cardIndex, moveSeat, setLegend, setLineBoundaries, swapLegends],
  );

  const vars = {
    '--lg-cell': shades.cell,
    '--lg-band': shades.band,
    '--lg-dash': shades.dash,
    '--lg-hint': shades.hint,
    '--lg-slot': '#ffffff',
  } as React.CSSProperties;

  // During a reorder drag the grid renders the arrangement as it would land:
  // every column re-derives at its previewed seat, so a shifted line shows
  // exactly the members that seat's join row admits — never cells outside
  // the template — and boundaries ride the line object, so custom evolution
  // rows survive a trip through a shorter column.
  const renderLines = previewMove
    ? reorderLines(card.lines, previewMove.from, previewMove.to)
    : card.lines;
  // A legendary in hand is off the board: the boss row shows the pokemon it
  // covers, so the outline under the pointer says what it would replace.
  const renderRows =
    previewMove || legendDrag
      ? deriveRows(renderLines, legendDrag ? [] : legendsOf(card))
      : rows;
  // A copy is carried once the gesture is a move: a vertical paint shifts an
  // evolution boundary in place, so there is nothing being carried there.
  const heldPokemon = held && legendDrag
    ? held.ids.map((id) => getPokemonById(id)).filter((p): p is NonNullable<typeof p> => !!p)
    : [];

  // The column's topmost pokemon carries the remove control for its line.
  // The legendary overlay is skipped: it is not the line, it covers it.
  const topRowBySeat = new Map<number, number>();
  renderRows.forEach((cells, i) => {
    for (const cell of cells) {
      if (cell.pokemonId !== null && !cell.isLegend && !topRowBySeat.has(cell.seat)) {
        topRowBySeat.set(cell.seat, i + 1);
      }
    }
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={legendDrag ? bossRowByColumn : rectIntersection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-elevated"
        style={{ ...vars, background: shades.base, padding: `${PAD_Y}rem ${PAD_X}rem` }}
      >
        <AcePartnerSlot cardIndex={cardIndex} view={view} />
        <TmSlot view={view} />
        <BadgeSlot cardIndex={cardIndex} view={view} />
        <Band label="GYM LEADER TEAM" />
        {renderRows.map((cells, i) => {
          const row = i + 1;
          const size = TEAM_SIZES[row - 1];
          const span = GLYPH_SPAN[row] ?? 1;
          const lead = 7 - size - span;
          const band = BAND_BEFORE[row];
          return (
            <div key={row}>
              {band && (
                <div className="mt-px">
                  <Band label={band.label} note={band.note} />
                </div>
              )}
              <div
                className="grid grid-cols-7 items-center"
                style={{
                  height: `${ROW_H}rem`,
                  boxShadow: row === 1 || band ? undefined : `inset 0 1px 0 ${shades.line}`,
                }}
              >
                {Array.from({ length: lead }, (_, k) => (
                  <div key={`lead-${k}`} />
                ))}
                <GlyphCell row={row} span={span} cell={shades.cell} />
                {cells.map((cell) => {
                  const line = renderLines[cell.seat - 1];
                  // The lifted legendary's own cell stays draggable even when
                  // nothing sits under it: dnd-kit ends a drag whose source
                  // draggable turns disabled mid-gesture.
                  const legendSource =
                    legendDrag !== null && row === BOSS_ROW && legendAt(card, cell.seat) !== null;
                  const datum: CellDatum = {
                    row,
                    seat: cell.seat,
                    stage: line ? stageAt(line, row) : 0,
                    isLegend: cell.isLegend,
                    filled: cell.pokemonId !== null || legendSource,
                    pokemonId: cell.pokemonId,
                  };
                  const topId = topRowBySeat.get(cell.seat) === row ? cell.pokemonId : null;
                  const custom =
                    topId !== null && line !== undefined
                    && line.boundaries.join() !== defaultBoundaries(line.branch).join();
                  return (
                    <PokemonCell
                      key={`${row}-${cell.seat}`}
                      cardIndex={cardIndex}
                      datum={datum}
                      pokemonId={cell.pokemonId}
                      form={formAt(powerupsAt(card, row), row, cell.seat, cell.pokemonId)}
                      powerupKind={isPowerupRow(row) ? powerupAt(card, row, cell.seat)?.kind ?? null : null}
                      onPowerup={
                        isPowerupRow(row) && cell.pokemonId !== null && !cell.isLegend
                          ? (kind) => cyclePowerupOnCard(cardIndex, row, cell.seat, kind, cell.pokemonId as number)
                          : undefined
                      }
                      held={previewMove !== null && cell.seat === previewMove.to && cell.pokemonId !== null && !cell.isLegend}
                      ringWhenOver={legendDrag}
                      // The legendary carries its own control: it covers a
                      // seat rather than filling one, so removing it puts
                      // that seat's own line back and touches nothing else.
                      onRemove={
                        cell.isLegend
                          // The seat has to be named: a row holds one
                          // legendary per seat now, so "clear" without one
                          // does not say which.
                          ? () => setLegend(cardIndex, null, cell.seat)
                          : topId !== null
                            ? () => removeLineWith(cardIndex, topId)
                            : undefined
                      }
                      removeLabel={cell.isLegend ? 'Remove the endgame boss legendary' : undefined}
                      onReset={
                        custom && line
                          ? () => setLineBoundaries(cardIndex, cell.seat, defaultBoundaries(line.branch))
                          : undefined
                      }
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {/* Hanging icon bullets: one column for the mark, one for the words, so
          every hint's text starts at the same indent and a wrapped line keeps
          it. The marks are icons rather than arrow characters, which the
          font sets at whatever weight it likes. */}
      <div className="grid grid-cols-[0.75rem_1fr] gap-x-[0.375rem] gap-y-[3px] px-[0.375rem] pt-2 text-[0.625rem] leading-[1.35] text-muted-foreground">
        <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>Drag a pokemon up or down to shift when it evolves</span>
        <ArrowLeftRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>Press and hold a column of pokemon to drag and reorder it</span>
        <LaurelIcon className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" />
        <span>
          {legendsOf(card).length > 0
            ? 'Drag a legendary onto another Endgame Boss column to move or swap it'
            : 'Tap a pokemon in the Endgame Boss row to swap in a legendary'}
        </span>
      </div>
      {/* Portalled out of the card's `zoom` so its pixel size is the one
          measured from the cell, not that size zoomed a second time. */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {held && heldPokemon.length > 0 ? (
            <HeldItems placement="above">
              {/* A cell, lifted off the card: same white face, same corner,
                  same shadow as the column drag's lifted cells. The sprite
                  alone read as a loose cutout beside them. */}
              <div
                data-held-face
                className="flex items-center justify-center"
                style={{
                  width: held.face.width,
                  height: held.face.height,
                  borderRadius: held.face.radius,
                  background: '#ffffff',
                  boxShadow: held.face.shadow,
                }}
              >
                {heldPokemon.map((p) => (
                  <img
                    key={p.id}
                    src={p.sprite}
                    alt=""
                    className="max-w-none"
                    style={{ width: held.sprite, height: held.sprite, imageRendering: 'pixelated' }}
                  />
                ))}
              </div>
            </HeldItems>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

export const CARD_ROWS_HEIGHT_REM =
  PAD_Y * 2 + BAND_H + ROW_COUNT * ROW_H + Object.keys(BAND_BEFORE).length * BAND_H;
