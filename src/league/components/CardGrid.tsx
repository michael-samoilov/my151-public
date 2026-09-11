import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  getClientRect,
  DragOverlay,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  rectIntersection,
  type CollisionDetection,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowLeftRight, ArrowUpDown, Plus } from 'lucide-react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel, useNamesVersion } from '@/i18n';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { HeldItems } from '@/components/shared/dragHold';
import { cn } from '@/lib/utils';
import { useGridDragSensors } from '@/lib/dragSensors';
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
import { cardShades } from '../theme';
import { CategoryChip } from './CategoryChip';
import { legendAt, legendsOf, powerupsAt, seatAfterMove, useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { openLeagueBrowser } from '../store/browserBridge';
import type { CardView } from '../useCardView';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars, TmDisc } from './glyphs';
import { PokeballBg } from '@/components/shared/PokeballBg';
import { formAt, formsFor, isPowerupRow, type PowerupForm, type PowerupKind } from '../model/powerups';
import { LaurelIcon } from './LaurelIcon';
import { placeSlot, seamEnds, type Placed, type Runs } from '../slotLayout';
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
/**
 * How far a held cell rises off the card.
 *
 * A quarter of a rem. Half of that was a lift you could see the card through
 * — the gap under each cell showed the row's own ground and every control the
 * cells beside it carry, so a column in hand read as a column coming apart.
 */
const CELL_LIFT_REM = 0.25;

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
  /**
   * The gesture has picked the column up.
   *
   * True from the start for a press that held still inside the cell it
   * pressed, and only then: a press that set off first is aiming at an
   * evolution boundary, and lifting its column would say the wrong thing
   * about what the finger is doing. It turns true later if the drag crosses
   * into another column, because that plainly is a reorder.
   */
  pickedUp: boolean;
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

/**
 * How far the pointer has travelled since it went down, in client pixels.
 *
 * The card's two gestures begin identically — a finger on a cell — and part
 * company only in what the finger does next. A press that stays put picks
 * the column up; one that sets off up or down is aiming at an evolution
 * boundary. dnd-kit starts the same drag either way, and the sensor's own
 * tolerance cannot tell them apart: standing the sensor down on movement
 * would take the boundary drag with it, which is the gesture that needs a
 * moving finger most. So the distance is measured here and read when the
 * drag starts.
 *
 * Capture-phase window listeners, because the cells stop propagation of
 * their own presses and the powerup buttons stop it outright.
 */
function usePointerTravel(): React.RefObject<number> {
  const travel = useRef(0);
  useEffect(() => {
    let from: { x: number; y: number } | null = null;
    const down = (e: PointerEvent) => {
      from = { x: e.clientX, y: e.clientY };
      travel.current = 0;
    };
    const move = (e: PointerEvent) => {
      if (!from) return;
      travel.current = Math.max(travel.current, Math.hypot(e.clientX - from.x, e.clientY - from.y));
    };
    const up = () => { from = null; };
    window.addEventListener('pointerdown', down, true);
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('pointercancel', up, true);
    return () => {
      window.removeEventListener('pointerdown', down, true);
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('pointercancel', up, true);
    };
  }, []);
  return travel;
}

/** See the `measuring` prop on the card's `DndContext`. */
const OVERLAY_MEASURING = {
  dragOverlay: { measure: (element: HTMLElement) => getClientRect(element, { ignoreTransform: true }) },
};

/**
 * The wash a dragged stage's cells wear: the Pokémon's primary type at a
 * strength that reads as a tint over white, not as a type badge.
 */
function stageTint(pokemonId: number): string {
  const type = getPokemonById(pokemonId)?.types[0];
  const colour = (type && TYPE_COLORS[type as keyof typeof TYPE_COLORS]) || '#888888';
  return `${colour}2e`;
}

/** A powerup form's sprite: the form's own id is its filename. */
function formSprite(form: PowerupForm): string {
  return `/sprites/pokemon/${form.id}.png`;
}

function PokemonCell({ cardIndex, datum, pokemonId, form, powerupKind, onPowerup, held, ringWhenOver, onRemove, removeLabel, onReset, tint, columnHovered }: {
  cardIndex: number;
  datum: CellDatum;
  /** The pointer is over this cell's column, so its white slot washes to the
   *  gym's tint. */
  columnHovered?: boolean;
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
  /**
   * A wash over the cell while its stage is being dragged: the dragged
   * Pokémon's primary type, light, on every cell that stage occupies.
   */
  tint?: string;
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
      // The wrapper fills the whole column track, so its `data-seat` drives the
      // column-hover wash across the gaps around the cell, and a `cursor-pointer`
      // plus a click here make the gap read and act as part of the column: a
      // click that lands beside the cell (not on it) runs the cell's own tap.
      data-seat={datum.seat}
      onClick={(e) => { if (e.target === e.currentTarget) onTap(); }}
      className="relative flex h-full cursor-pointer items-center justify-center"
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
        data-stage-tint={tint ?? undefined}
        onClick={onTap}
        className={cn(
          'relative flex items-center justify-center rounded-md',
          // A filled cell drags; an empty one opens the line picker on a tap,
          // so it wears a pointer to say it is pressable.
          datum.filled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          ringed && 'ring-2 ring-[var(--lg-cell)]',
        )}
        style={{
          width: `calc(100% - ${2 * INSET_X}rem)`,
          height: `${ROW_H - 2 * INSET_Y}rem`,
          // The tint is a layer over the slot's white rather than a colour
          // in place of it, so the wash reads the same on every card. The
          // column-hover wash is the same idea in the gym's own `hover` shade.
          background: tint
            ? `linear-gradient(${tint}, ${tint}), var(--lg-slot)`
            : columnHovered
              ? `linear-gradient(var(--lg-hover), var(--lg-hover)), var(--lg-slot)`
              : 'var(--lg-slot)',
          // A cell with a line in it keeps the touch it is given. `pan-y`
          // let the page scroll under the very gesture that is supposed to
          // move a line up a row, so a drag begun with a moving finger
          // scrolled the card away instead; dropping the pan leaves that
          // touch to the drag, which is what a filled cell is for. `none`
          // would go too far and take the browser's pinch with it, and the
          // cells are most of the card.
          //
          // An empty cell has no drag to offer — it opens a picker on a tap —
          // so it hands the pan back rather than swallowing it. See
          // `useGridDragSensors`.
          touchAction: datum.filled ? 'pinch-zoom' : 'pan-y pinch-zoom',
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
          // Keyed by its own source. Without that React keeps the element and
          // swaps the `src`, and the browser keeps painting the frame it
          // already decoded — so opening a second gym showed the first gym's
          // team under the second gym's name and colours until the new
          // sprites arrived. A new element paints nothing instead.
          <img
            key={form ? formSprite(form) : pokemon.sprite}
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
          // No paint containment, unlike the cross and the powerup discs.
          // Containment was what kept a span's `rounded-full` round; an svg
          // circle is round on its own. And containment clips the button to
          // a box snapped to the device grid, while the disc below is drawn
          // to the very edge of that box -- so at some sub-pixel positions
          // the clip shaved a device pixel off one side of the disc, and the
          // disc read as off-centre by half of it.
          className="absolute z-[15] cursor-pointer"
          style={markBox('left', 0.175)}
        >
          {/* One svg for the disc and the arrow, the way `RedXIcon` draws
              its disc and its cross. They used to be two layers -- a
              rounded span for the disc and a lucide svg over it -- and two
              layers are two rasterisations. The card scales itself with CSS
              `zoom`, so each control sits at a fractional device pixel, and
              the disc's edge and the arrow's strokes snapped to the grid
              independently: measured at dpr 3, the arrow sat 0.6px up-left
              of the disc's centre on one row and 1.1px on the next, and the
              eye read the two resets on one card as one centred and one not.
              Drawn together they share a phase, so whatever the origin does
              to one it does to the other.

              The 38-unit box is lucide's 24-unit icon inset by 7 on each
              side, with the origin pulled a further half unit up and left:
              the arrow carries its head outside the ring on that corner, so
              its painted ink sits 1.3% up and left of the box it is drawn
              in, and the half unit -- measured, not guessed -- is what puts
              the ink's centre on the disc's. The disc is centred on the box,
              at (11.5, 11.5), with a radius that fills it. `strokeWidth` is
              in viewBox units, so it scales with the inset. The two paths
              are lucide's `rotate-ccw` (ISC), copied so they can share the
              disc's svg. */}
          <svg viewBox="-7.5 -7.5 38 38" className="block h-full w-full" aria-hidden="true">
            <circle cx="11.5" cy="11.5" r="19" fill="#2563eb" />
            <g fill="none" stroke="#ffffff" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </g>
          </svg>
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
          className="absolute z-[15] cursor-pointer"
          style={markBox('right', 0.175)}
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

/**
 * The card's small round controls: the remove cross, the reset disc and the
 * two powerup discs. One size for all four, so a corner reads as one family
 * whichever control sits in it — the crosses and the reset were 0.95rem
 * against the discs' 1rem.
 *
 * `MARK_PAD_REM` is press box outside the paint, on every side. Sixteen
 * pixels is under half of what a thumb needs, and these sit in the corners
 * of cells whose own tap opens a picker, so the miss goes somewhere. The
 * powerup buttons already carry a box of their own, tuned to the room the
 * row has above them; this is the same idea for the two that had none.
 */
const MARK_REM = DISC_REM;
const MARK_PAD_REM = 0.1875;
const MARK_BOX_REM = MARK_REM + 2 * MARK_PAD_REM;
/**
 * How far the paint keeps off the corner it sits in.
 *
 * A pixel, and it is not decoration. The cross used to be flush: its top edge
 * on its box's top edge and its right edge on its box's right, measured at
 * every phone width. A round shape whose outermost pixels land exactly on a
 * boundary is a shape the renderer may shave, and under the card's CSS `zoom`
 * — where every edge is a fraction of a device pixel — one did: the cross
 * came back with its top-right quadrant squared off. A pixel of ground is
 * enough that the rounding has somewhere to go.
 */
const MARK_EDGE_REM = 0.0625;

/**
 * A corner control's press box, placed so its paint lands where it did.
 *
 * It grows up and down freely — the rows are 6px apart and the paint sits
 * 2.8px inside its cell, so there is room either side. Sideways it grows
 * *inward* only: cells touch, so a box that hung past a cell's right edge
 * landed on its neighbour's own control. Measured at a 320px viewport, where
 * a cell is 32.5px: an outward pad put a remove cross 5.7px over the next
 * cell's reset. So the outer edge stays where the paint's is, and what the
 * box takes is the cell's own tap — which is the mis-tap being prevented.
 */
function markBox(side: 'left' | 'right', inset: number): React.CSSProperties {
  const pad = `${MARK_PAD_REM}rem`;
  const edge = `${MARK_EDGE_REM}rem`;
  const inner = side === 'right' ? 'paddingLeft' : 'paddingRight';
  const outer = side === 'right' ? 'paddingRight' : 'paddingLeft';
  return {
    [side]: 0,
    top: `${inset - MARK_PAD_REM}rem`,
    // The box carries the edge as well as the pad, so keeping the paint off
    // the corner costs the press box nothing.
    width: `${MARK_REM + MARK_PAD_REM + MARK_EDGE_REM}rem`,
    height: `${MARK_BOX_REM + MARK_EDGE_REM}rem`,
    paddingTop: `${MARK_PAD_REM + MARK_EDGE_REM}rem`,
    paddingBottom: pad,
    [inner]: pad,
    [outer]: edge,
  };
}

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
        // No transition on the ring or the symbol. A press used to ease the
        // ring's shadow and the symbol's opacity over 150ms, and for exactly
        // those nine frames the crosses and resets on the row below sat one
        // to two device pixels up and to the side, then dropped back: WebKit
        // composites an element while it transitions, and the discs whose
        // boxes overlap it get rasterised on layers of their own, snapped to
        // a different grid. Measured on a phone recording at 60fps, disc by
        // disc; a cross on a row with no powerup never moved. The state
        // change is instant now, so nothing is composited and nothing moves.
        className={cn(
          'flex items-center justify-center rounded-full bg-white [contain:paint]',
          active ? 'ring-2 ring-[var(--lg-band)] shadow' : 'ring-1 ring-black/15',
        )}
        style={{ width: `${DISC_REM}rem`, height: `${DISC_REM}rem` }}
      >
        {/* The disc stays opaque so the symbol always has a ground; the
            symbol itself dims when the powerup is merely available. */}
        <img
          src={`/powerups/${kind}.png`}
          alt=""
          className={cn('object-contain', !active && 'opacity-55')}
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
  place, testId, half, heading, mirrored, pokemon, nameClass,
  headClass, onPick, onRemove,
}: {
  place: Placed | null;
  testId: string;
  half: 'ace' | 'partner';
  heading: Heading;
  /** The partner's block is the ace's turned over: name, sprite, heading. */
  mirrored: boolean;
  pokemon: ReturnType<typeof getPokemonById>;
  nameClass: string;
  headClass: string;
  onPick: () => void;
  onRemove: () => void;
}) {
  // The same two shades the TM and BADGE words wear: the hint while the
  // half is empty, the band once it holds a Pokemon. Both are the gym's
  // own, which is right here -- an ace or a partner has no type of its own
  // the way a TM's move does.
  const label = (
    <HeadRuns
      lines={heading.lines}
      className={headClass}
      style={{ color: pokemon ? 'var(--lg-band)' : 'var(--lg-hint)' }}
    />
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
  // The square the geometry reserves, with the ball inside it. Filled, that
  // is the two-tone ball the dex builder's tiles draw, with the sprite
  // overhanging it; empty, it is the same outline the card's own team seats
  // use. Both are sized by the solver, so the placeholder stands where the
  // ball will be.
  const art = (
    <span
      data-slot-art
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      {pokemon ? (
        <>
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{ width: `${place?.ball ?? 0}px`, height: `${place?.ball ?? 0}px` }}
          >
            <PokeballBg pokemon={pokemon} />
          </span>
          <img
            key={pokemon.sprite}
            src={pokemon.sprite}
            alt={pokemon.name}
            className="relative z-[1] max-w-none"
            style={{ width: size, height: size, imageRendering: 'pixelated' }}
          />
          {/* On the square, not on the block: the block's own corner is where
              the heading and the name are, and a cross there sits on the
              words. */}
          <SlotRemove label={`Remove ${heading.label.toLowerCase()}`} onRemove={onRemove} />
        </>
      ) : (
        <span
          data-slot-ring
          className="block"
          style={{ width: `${place?.ring ?? 0}px`, height: `${place?.ring ?? 0}px` }}
        >
          <EmptySlotBall size={place?.ring ?? 0} />
        </span>
      )}
    </span>
  );
  // Blank when empty, but it still takes its line: that is what holds the
  // heading where it sits once a Pokemon is chosen.
  const name = (
    // Held to the sprite's width. The two names are the runs either side of
    // the seam, so a name allowed to grow the block grows it into the other
    // half — at 320px that put one name through the other.
    <span
      className={cn('relative block truncate leading-tight', nameClass)}
      style={{ maxWidth: size, top: `${place?.nameShift ?? 0}px` }}
    >
      {pokemon ? pokemonLabel(pokemon.id, pokemon.name).name : '\u00a0'}
    </span>
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
      aria-label={
        pokemon ? `${heading.label}: ${pokemon.name}` : `Choose a ${heading.label.toLowerCase()}`
      }
      className={cn(
        'absolute z-[6] flex flex-col items-center text-center',
        // The half opens a one-Pokémon picker on a tap, so it wears a pointer.
        // The slot lab overrides it with a grab handle for its drag-to-tune.
        lab ? 'cursor-grab touch-none rounded outline-dashed outline-1 outline-offset-2' : 'cursor-pointer',
      )}
      style={{
        left: `${(place?.left ?? 0) + offset.x}px`,
        top: `${(place?.top ?? 0) + offset.y}px`,
        width: `${place?.width ?? 0}px`,
        visibility: place ? undefined : 'hidden',
        outlineColor: lab ? 'rgba(37,99,235,0.5)' : undefined,
      }}
    >
      {mirrored ? <>{name}{art}{label}</> : <>{label}{art}{name}</>}
    </button>
  );
}

/**
 * The card's remove control, in the corner of whatever it is given.
 *
 * The same red cross the cells carry, so a slot with something in it is
 * cleared the way an evolution line is. `stopPropagation` matters: every one
 * of these sits inside a button that opens a picker.
 */
function SlotRemove({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-slot-remove
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onRemove();
      }}
      className="absolute z-[15] cursor-pointer"
      style={markBox('right', 0)}
    >
      <RedXIcon className="h-full w-full" />
    </button>
  );
}

/**
 * A slot heading: what it shows, and what it is called.
 *
 * `lines` is the drawn form and `label` the spoken one. The partner's two
 * lines are two names for one role, with the slash drawn so they read as
 * alternatives rather than a phrase; reading both out adds nothing, so its
 * label is the first. The ace's lines are one phrase broken in two, so the
 * label keeps it whole.
 */
interface Heading {
  readonly lines: readonly string[];
  readonly label: string;
}

/**
 * The dashed outline an empty slot wears.
 *
 * An overlay rather than a border on the slot itself. A border is layout:
 * with `box-sizing: border-box` it takes its pixel from the inside, so every
 * slot's content sat one pixel further in while the slot was empty and
 * stepped back out the moment something was chosen -- measured at 1.07px
 * on a phone and 1.42px on desktop, in both axes, in all three panes. Nothing
 * here takes part in layout, so filling a slot moves nothing. It also makes
 * the placement solver's model true: it sizes the ace and partner against
 * `offsetWidth`, the outer box, and places them in the padding box, and
 * those are now the same box in both states.
 *
 * First among the children so the content paints over it, though the two
 * never meet: the outline is the outer pixel and the content is padded in.
 */
function EmptyOutline() {
  return (
    <span
      aria-hidden="true"
      data-empty-outline
      className="pointer-events-none absolute inset-0 rounded-lg border border-dashed"
      style={{ borderColor: 'var(--lg-dash)' }}
    />
  );
}

const ACE_HEAD: Heading = { lines: ['ACE', 'POKÉMON'], label: 'ACE POKÉMON' };
const PARTNER_HEAD: Heading = { lines: ['PARTNER /', 'SHOULDERMON'], label: 'PARTNER' };
const HEAD_CLASS = 'text-[0.53125rem] font-extrabold tracking-[0.08em] leading-[1.4]';

/**
 * A heading, one line per run, drawn the same way in the slot and in the probe.
 *
 * One component for both so the two cannot drift. The solver budgets the
 * exact height the probe measures, so a heading that wrapped to a third line
 * in the slot would be placed as though it had two -- which is why each line
 * refuses to wrap rather than the heading as a whole.
 */
function HeadRuns({ lines, className, style, ...rest }: {
  lines: readonly string[];
  className?: string;
  style?: React.CSSProperties;
  /** Set on the probe copies, which the solver looks them up by. */
  'data-probe'?: string;
}) {
  return (
    <span {...rest} className={cn('inline-block text-center', className)} style={style}>
      {lines.map((line) => (
        <span key={line} className="block whitespace-nowrap">{line}</span>
      ))}
    </span>
  );
}
// The name is held to the sprite's width and truncates past it (see
// `slotLayout.ts`), so its size is what decides how many letters clear the
// seam. At 0.8125rem an eight-letter name filled the box to the last pixel and
// a 2x display's subpixel rounding still clipped it; 0.75rem buys a few
// letters' margin without reading as small.
const ACE_NAME_CLASS = 'text-[0.75rem] font-medium';
const PARTNER_NAME_CLASS = 'text-[0.75rem] font-medium';

/**
 * Measure the slot, then solve both halves against what it actually is.
 *
 * The run sizes come from the DOM rather than from constants: the heading and
 * the name are text, so their widths follow the font, the language and the
 * root font size, none of which this file gets to decide. A hidden copy of
 * each run is measured once per resize and handed to the solver.
 */
function useSlotLayout(ref: React.RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<
    { ace: Placed; partner: Placed; box: [number, number] } | null
  >(null);
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
      // The layout box, not the box on the screen. The card scales itself
      // with CSS `zoom`, so a child placed at `left: 6px` is six *layout*
      // pixels in and the zoom shrinks that to four or five on the glass.
      // Solving against the screen box and applying the answer in the layout
      // box is a placement scaled toward the top-left corner by the zoom —
      // 24% of the slot on a short phone, which is where the pair being
      // "not in the centre of mass of its segment" came from.
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (!probe || w < 8 || h < 8 || box.width < 8) return;
      // The runs are text, so they can only be measured on the screen. Take
      // the zoom back out so they arrive in the same units as the slot.
      const zoom = box.width / w;
      const run = (sel: string): [number, number] => {
        const r = probe.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
        return [r.width / zoom, r.height / zoom];
      };
      const ace: Runs = { head: run('[data-probe="ace-head"]'), name: run('[data-probe="ace-name"]') };
      const partner: Runs = { head: run('[data-probe="partner-head"]'), name: run('[data-probe="partner-name"]') };
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
      setLayout({ ...placeSlot(w, h, ace, partner, lab.enabled ? lab.sprite : undefined), box: [w, h] });
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
    // And the 30 frames are not enough either. They cover a webfont that
    // swaps within about half a second of mount; on a cold cache or a slow
    // connection it swaps later, and then the placement is the one solved
    // against the fallback metrics and nothing ever corrects it — the same
    // trap `typeBadgeFit` keeps a generation counter for.
    //
    // Measuring again when the fonts resolve costs one rect read, and the
    // key guard above makes it free when they resolved before mount.
    let alive = true;
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      void document.fonts.ready.then(() => { if (alive) measure(); });
    }
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [ref, version, labSprite]);
  return layout;
}

function AcePartnerSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const setSignatureSeat = useLeagueStore((s) => s.setSignatureSeat);
  const setPartner = useLeagueStore((s) => s.setPartner);
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
  const seam = seamEnds(layout?.box[0] ?? 1, layout?.box[1] ?? 1);
  const pos = {
    ...slotX(1, 3),
    top: `${rowTop(1) + INSET_Y}rem`,
    height: `${4 * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <div
      ref={slotRef}
      className="absolute z-[5] rounded-lg"
      style={{
        ...pos,
        background: ace || partner ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!(ace || partner) && <EmptyOutline />}
      {/* The four text runs the solver needs the size of, drawn once and never
          shown. Measuring them beats assuming them: they are text, so their
          widths move with the font, the language and the root font size. */}
      <span
        data-slot-probe
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 whitespace-nowrap"
      >
        <HeadRuns lines={ACE_HEAD.lines} className={HEAD_CLASS} data-probe="ace-head" />
        <span data-probe="ace-name" className={cn('inline-block leading-tight', ACE_NAME_CLASS)}>
          {ace ? pokemonLabel(ace.id, ace.name).name : '\u00a0'}
        </span>
        <HeadRuns lines={PARTNER_HEAD.lines} className={HEAD_CLASS} data-probe="partner-head" />
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
          x1={seam.x1 * 100}
          y1={seam.y1 * 100}
          x2={seam.x2 * 100}
          y2={seam.y2 * 100}
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
        mirrored={false}
        pokemon={ace}
        nameClass={ACE_NAME_CLASS}
        headClass={HEAD_CLASS}
        onPick={() => openLeagueBrowser(cardIndex, 'signature')}
        onRemove={() => setSignatureSeat(cardIndex, null, null)}
      />
      <SlotHalf
        place={layout?.partner ?? null}
        testId="slot-partner"
        half="partner"
        heading={PARTNER_HEAD}
        mirrored
        pokemon={partner}
        nameClass={PARTNER_NAME_CLASS}
        headClass={HEAD_CLASS}
        onPick={() => openLeagueBrowser(cardIndex, 'partner')}
        onRemove={() => setPartner(cardIndex, null)}
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
const MARK_COL = 'min(2.75rem, 26%)';
/**
 * The box's left pad and the gap after the glyph column: equal, on purpose.
 *
 * The word under the glyph is centred in its column, so the room between
 * the box's edge and the word is `pad + (column - word) / 2`, and the room
 * between the word and the name beside it is `(column - word) / 2 + gap`.
 * They differ by exactly `gap - pad`, whatever the word: equal pad and gap
 * put BADGE as far from the edge as from its name.
 *
 * Their sum is what the text gives up, and it is held at 0.5625rem. The
 * longest single-word move in the data is twelve characters — Flamethrower,
 * Aromatherapy — and a single word cannot wrap, so every pixel left of it is
 * a pixel it does not have. At 0.375rem apiece it cleared the box by one
 * pixel on a phone.
 */
const MARK_PAD = '0.28125rem';
/**
 * The gap after the glyph column, which is also where the move name and the
 * badge name begin. See `MARK_PAD`: the two are equal, and their sum fixed.
 */
const MARK_GAP = '0.28125rem';
/**
 * The pad after the text, which is what pays for that gap.
 *
 * The gap was 0.25rem, which put the name hard against the disc. Widening it
 * moves the name right, and a name that starts two pixels later is a name
 * with two fewer pixels — measured, that clipped Flamethrower at a 360px
 * viewport, where it had 0.76px to spare. So the two pixels come off the far
 * side instead: the text column keeps its width and only moves. Its right
 * edge is the slot's own rounded corner, which is empty anyway.
 */
const MARK_TRAIL = '0.0625rem';
// A share of the column, not of the box. A percentage inside the column
// resolves against the column, so repeating the box fraction here multiplies
// the two and collapses the glyph to a few pixels.
const MARK_GLYPH = '72%';
const MARK_LABEL_CLASS = 'text-[0.5rem] font-extrabold tracking-[0.06em]';

function TmSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const setTm = useLeagueStore((s) => s.setTm);
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
      className="absolute z-[5] flex cursor-pointer items-center rounded-lg"
      style={{
        ...pos,
        paddingLeft: MARK_PAD,
        gap: MARK_GAP,
        background: move ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!move && <EmptyOutline />}
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
        {/* Both slots follow one rule: the glyph takes a type's unshaded
            palette colour, the word takes that same type's band shade -- the
            shade ACE POKEMON and PARTNER already wear. Which type differs.
            The disc and its word answer to the move, because a TM is the
            move; the hexagon and BADGE answer to the gym. So the word here
            reads the move's own band rather than the card's `--lg-band`. */}
        <span
          className={cn('-mt-[0.0625rem]', MARK_LABEL_CLASS)}
          style={{ color: move ? cardShades(move.type).band : 'var(--lg-hint)' }}
        >
          TM
        </span>
      </span>
      {move ? (
        <span className="flex min-w-0 flex-col items-start gap-[2px] overflow-hidden">
          {/* Clipped rather than spilling. At 320px the type badge and the
              category chip together are wider than the box's text column, and
              a chip painted over the cell beside it is worse than one cut. */}
          <span className="flex min-w-0 items-center gap-[3px]">
            {/* `overflow-visible`: the badge's pill fills its viewBox to the
                edge, and an outer svg clips to its own box by default. This
                svg's width is fractional, so its right edge falls inside a
                device pixel, and WebKit clips that pixel away: the pill's
                last antialiased column on the right is never painted and
                the end reads as a wall while the left end stays round --
                what a phone showed. Measured on WebKitGTK (AppleWebKit 605,
                the harness's iOS lane) at scale 3, same build and layout,
                only this class toggled: without it the right end's outermost
                column is 49% covered against the left's 28%; with it, 29%.
                The two renders differ in nothing else. Letting the svg paint
                past its box costs nothing -- there is nothing outside the
                viewBox to paint -- and the text column's own clip still
                bounds it. */}
            <TypeBadge type={move.type} className="w-[2.75rem] max-w-full shrink overflow-visible" />
            <CategoryChip category={move.category} className="h-[0.6875rem] w-[0.9375rem] rounded-[4px] border" />
          </span>
          {/* Truncated, not wrapped: a twelve-letter move is one word, so
              a wrap would break it mid-syllable. Below about 340px of
              viewport the box cannot hold the longest of them however far
              left the text starts. */}
          <span
            className="min-w-0 max-w-full truncate text-left text-[0.6875rem] leading-[1.15]"
            style={{ paddingRight: MARK_TRAIL }}
          >
            {move.name}
          </span>
        </span>
      ) : (
        <span className="min-w-0 text-left text-[0.6875rem] leading-[1.15]" style={{ color: 'var(--lg-hint)' }}>
          Pick a move
        </span>
      )}
      {move && <SlotRemove label="Remove TM" onRemove={() => setTm(cardIndex, null)} />}
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
      className="absolute z-[5] flex cursor-text items-center rounded-lg"
      style={{
        ...pos,
        paddingLeft: MARK_PAD,
        gap: MARK_GAP,
        background: name ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!name && <EmptyOutline />}
      {/* The same column the TM slot uses, so the hexagon sits under the disc
          and the word under the word. */}
      <span
        className="flex shrink-0 flex-col items-center"
        style={{ width: MARK_COL }}
      >
        {/* Drawn the way the TM disc is drawn: an outline in the type's own
            colour, not a filled shape. The fill was the reason the two slots
            never matched -- a solid hexagon needs a muted shade to keep its
            white centre readable, so it could never wear the vivid colour the
            disc wears. Filling it with the raw type colour instead puts white
            on #FAC000 at 1.67:1 for electric, which is not a centre at all.
            Outlined, the slot background is the centre and every type reads.
            The stroke is 2.4 in a 32 box against the disc's 2 in 24 -- the
            same weight relative to the glyph, so neither looks lighter.
            Empty, it wears the disc's own empty stroke: solid, and 2 in 24 is
            8/3 in 32, so the two waiting outlines match. */}
        <svg viewBox="0 0 32 32" className="w-full" style={{ aspectRatio: '1', maxWidth: MARK_GLYPH }}>
          <path
            d="M16 3 L27 9.5 L27 22.5 L16 29 L5 22.5 L5 9.5 Z"
            fill="none"
            stroke={name ? view.shades.type : 'var(--lg-dash)'}
            strokeWidth={name ? 2.4 : 8 / 3}
          />
          <circle
            cx="16"
            cy="16"
            r="4.4"
            fill="none"
            stroke={name ? view.shades.type : 'var(--lg-dash)'}
            strokeWidth={name ? 2.4 : 8 / 3}
          />
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
        className="min-w-0 flex-1 overflow-hidden pr-[0.25rem] text-left text-[0.65625rem] leading-tight"
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
      {name && (
        <SlotRemove
          label="Remove badge name"
          onRemove={() => {
            setBadgeName(cardIndex, '');
            const field = fieldRef.current;
            if (field) field.textContent = '';
          }}
        />
      )}
    </div>
  );
}

export function CardGrid({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const moveSeat = useLeagueStore((s) => s.moveSeat);
  const setStageBoundary = useLeagueStore((s) => s.setStageBoundary);
  const setLineBoundaries = useLeagueStore((s) => s.setLineBoundaries);
  const setLegend = useLeagueStore((s) => s.setLegend);
  const swapLegends = useLeagueStore((s) => s.swapLegends);
  const removeLineAt = useLeagueStore((s) => s.removeLineAt);
  const cyclePowerupOnCard = useLeagueStore((s) => s.cyclePowerup);
  const { card, shades, rows } = view;

  const sensors = useGridDragSensors();

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
  /**
   * The stage a boundary drag is moving, while it moves. Its cells wear a
   * wash of the Pokémon's primary type, so the thing being dragged is the
   * run and not one cell of it. Set when a drag sets off as a boundary
   * drag, or the moment a held column starts painting rows; cleared when
   * the gesture turns out to be a reorder.
   */
  const [stageDrag, setStageDrag] = useState<{ seat: number; stage: number } | null>(null);
  const travelRef = usePointerTravel();
  /**
   * The column a moving press did not pick up.
   *
   * A press that set off before the hold was up is aiming at an evolution
   * boundary, so the card does not lift its column — but the same drag can
   * still cross into another column, and at that point it plainly is a
   * reorder. The lift waits here until it is.
   */
  const pendingHeld = useRef<typeof held>(null);
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
      // Which of the card's two gestures this is. They begin identically —
      // a finger on a cell — and part company in what the finger does next.
      // A cell's own radius is the stillness the pickup asks for: stay inside
      // the thing you pressed and you are holding it, leave it and you are
      // dragging a boundary. Measured off the cell rather than named as a
      // constant, so it follows the card's scale.
      const pickedUp = travelRef.current <= (cell?.height ?? 0) / 2;
      // A column drag carries the column: its line's members, stacked, which
      // is what the column holds however many rows it spans. A legendary
      // drag carries the one Pokémon it is.
      const grabbed = card.lines[d.seat - 1];
      if (d.isLegend) {
        setHeld({ ids: legendAt(card, d.seat) ? [legendAt(card, d.seat)!.pokemonId] : [], sprite, face });
      } else if (grabbed) {
        const column = { ids: grabbed.branch, sprite, face };
        if (pickedUp) {
          setHeld(column);
          // Held over its own seat is still held. Seeding the preview here is
          // what makes a press and hold say so before the column has gone
          // anywhere: without it the column looks untouched until it reaches
          // some *other* seat, so the gesture gives no sign it is ready.
          // `moveSeat` is a no-op when the two seats are the same, so nothing
          // moves — only the feedback appears.
          setPreviewMove({ from: d.seat, to: d.seat });
        } else {
          pendingHeld.current = column;
        }
      }
      if (d.isLegend) {
        paintRef.current = {
          legend: true, seat: d.seat, stage: 0, startRow: d.row, role: 'mid',
          runTop: d.row, runBottom: d.row, canTop: false, canBottom: false,
          reordered: false, pickedUp: true,
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
        runTop, runBottom, canTop, canBottom, reordered: false, pickedUp,
        initial: [...line.boundaries], painted: false,
      };
      if (!pickedUp) setStageDrag({ seat: d.seat, stage });
    },
    [card, travelRef],
  );

  const onDragOver = useCallback(
    (e: DragOverEvent) => {
      const p = paintRef.current;
      const over = e.over?.data.current as CellDatum | undefined;
      if (!p || p.legend || !over) return;
      if (over.seat !== p.seat) {
        // The gesture is a reorder: undo any paint, preview the target seats.
        p.reordered = true;
        // A press that set off too fast to be a pickup has just crossed into
        // another column, which is what a reorder is. Lift it now.
        p.pickedUp = true;
        if (pendingHeld.current) {
          setHeld(pendingHeld.current);
          pendingHeld.current = null;
        }
        if (p.painted) {
          setLineBoundaries(cardIndex, p.seat, p.initial);
          p.painted = false;
        }
        setStageDrag(null);
        setPreviewMove((cur) =>
          cur && cur.to === over.seat ? cur : { from: p.seat, to: over.seat },
        );
        return;
      }
      // Back over its own seat: still held, just not moved. Clearing the
      // preview here would drop the picked-up look every time the column
      // passes over where it started. Only for a gesture that picked the
      // column up in the first place — this line is what used to give a
      // boundary drag the lifted look one frame after the drag began.
      if (p.pickedUp) {
        setPreviewMove((cur) =>
          cur && cur.from === p.seat && cur.to === p.seat ? cur : { from: p.seat, to: p.seat },
        );
      }
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
      if (p.painted) setStageDrag((cur) => cur ?? { seat: p.seat, stage: p.stage });
    },
    [cardIndex, setLineBoundaries, setStageBoundary],
  );

  const onDragCancel = useCallback(() => {
    const p = paintRef.current;
    paintRef.current = null;
    if (p && !p.legend && p.painted) setLineBoundaries(cardIndex, p.seat, p.initial);
    setPreviewMove(null);
    setLegendDrag(false);
    setStageDrag(null);
    setHeld(null);
    pendingHeld.current = null;
  }, [cardIndex, setLineBoundaries]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const p = paintRef.current;
      paintRef.current = null;
      setPreviewMove(null);
      setLegendDrag(false);
      setStageDrag(null);
      setHeld(null);
      pendingHeld.current = null;
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
    '--lg-hover': shades.hover,
  } as React.CSSProperties;

  // Which column (seat) the pointer is over, so the whole column's white cells
  // wash to the gym's own tint — the hover state the theme's `hover` shade was
  // cut for. Read off the cell's full-height wrapper (`data-seat`), not the
  // cell itself, so the wash holds while the pointer is in the gaps between and
  // around the cells, not only dead on one. Off during a drag: the gesture
  // speaks for itself and a wash under it only muddies the read.
  const [hoverSeat, setHoverSeat] = useState<number | null>(null);
  const onGridHover = useCallback((e: React.MouseEvent) => {
    const wrap = (e.target as HTMLElement).closest('[data-seat]');
    const seat = wrap?.getAttribute('data-seat');
    setHoverSeat(seat !== null && seat !== undefined ? Number(seat) : null);
  }, []);

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
  /**
   * Where a seat's own things end up while the preview holds.
   *
   * The powerup and the legendary both name a seat, and the store re-aims
   * them when the drop lands (`moveSeat`). Until then the preview drew them
   * at the seats they started in, so a column carrying a Mega showed its base
   * form all the way across the card and only became a Mega once it was let
   * go — and whatever column it displaced wore the Mega in the meantime.
   */
  const previewSeat = useCallback(
    (seat: number) => (previewMove ? seatAfterMove(seat, previewMove.from, previewMove.to) ?? seat : seat),
    [previewMove],
  );
  const previewPowerups = useCallback(
    (row: number) => powerupsAt(card, row).map((p) => ({ ...p, seat: previewSeat(p.seat) })),
    [card, previewSeat],
  );
  /**
   * A column is in hand, so the card's own controls stand down.
   *
   * The remove cross, the reset disc and the two powerup discs are for a card
   * at rest. Mid-drag they are unreachable — a finger is already on the card
   * — and a lifted cell shows the ones on the row under it through the gap it
   * leaves, which reads as the column shedding its buttons as it goes.
   */
  const inHand = previewMove !== null || legendDrag;
  const renderRows =
    previewMove || legendDrag
      ? deriveRows(
          renderLines,
          legendDrag
            ? []
            : legendsOf(card).map((l) => ({ ...l, seat: previewSeat(l.seat) })),
        )
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
      // The compensation is dnd-kit answering a layout shift that is not one.
      // A held cell lifts by `CELL_LIFT_REM`, so its rect moves the moment the
      // drag starts; dnd-kit reads that as the page having shifted under the
      // finger and scrolls the pane by the same amount to put it back. What
      // the user sees is the card jumping three pixels every time they press
      // and hold. Measured on the built preview: the pane went 56 -> 59 on a
      // press, and stays put with this off. Both dex builder grids already
      // carry the same line.
      autoScroll={{ layoutShiftCompensation: false }}
      // The overlay is measured where it was placed, not where it has moved
      // to. dnd-kit prefers the overlay's rect to the cell's for collisions,
      // and measures it once, when it mounts -- with its transform. A drag
      // that begins on movement mounts the overlay after the first move,
      // so it was measured a move too high, and every row it was over from
      // then on was one above the finger. A press and hold mounts it at
      // rest and never saw this. Ignoring the transform reads the rect the
      // overlay was positioned at, which is the cell's, whenever it mounts.
      measuring={OVERLAY_MEASURING}
      collisionDetection={legendDrag ? bossRowByColumn : rectIntersection}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        data-lg-card-root
        className="relative overflow-hidden rounded-2xl shadow-elevated"
        style={{ ...vars, background: shades.base, padding: `${PAD_Y}rem ${PAD_X}rem` }}
        onMouseOver={onGridHover}
        onMouseLeave={() => setHoverSeat(null)}
      >
        <AcePartnerSlot cardIndex={cardIndex} view={view} />
        <TmSlot cardIndex={cardIndex} view={view} />
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
                  // Read off the live line, so the wash follows the run as
                  // the drag grows or shrinks it.
                  const tinted =
                    stageDrag !== null && line !== undefined && cell.pokemonId !== null && !cell.isLegend
                    && cell.seat === stageDrag.seat && datum.stage === stageDrag.stage;
                  return (
                    <PokemonCell
                      key={`${row}-${cell.seat}`}
                      cardIndex={cardIndex}
                      datum={datum}
                      columnHovered={!inHand && stageDrag === null && !legendDrag && hoverSeat === cell.seat}
                      tint={tinted ? stageTint(line.branch[stageDrag.stage]) : undefined}
                      pokemonId={cell.pokemonId}
                      form={formAt(previewPowerups(row), row, cell.seat, cell.pokemonId)}
                      powerupKind={
                        isPowerupRow(row)
                          ? previewPowerups(row).find((p) => p.seat === cell.seat)?.kind ?? null
                          : null
                      }
                      onPowerup={
                        !inHand && isPowerupRow(row) && cell.pokemonId !== null && !cell.isLegend
                          ? (kind) => cyclePowerupOnCard(cardIndex, row, cell.seat, kind, cell.pokemonId as number)
                          : undefined
                      }
                      // A legendary sitting on this column rises with it. It
                      // used to be excluded, so a column with one lifted
                      // around it and the legendary stayed down on the card —
                      // a hole in the middle of the thing in hand. During a
                      // *legendary* drag `previewMove` is null, so this only
                      // ever reads a column drag.
                      held={previewMove !== null && cell.seat === previewMove.to && cell.pokemonId !== null}
                      ringWhenOver={legendDrag}
                      // The legendary carries its own control: it covers a
                      // seat rather than filling one, so removing it puts
                      // that seat's own line back and touches nothing else.
                      onRemove={
                        inHand
                          ? undefined
                          : cell.isLegend
                            // The seat has to be named: a row holds one
                            // legendary per seat now, so "clear" without one
                            // does not say which.
                            ? () => setLegend(cardIndex, null, cell.seat)
                            : topId !== null
                              // By seat, not by id: a card can hold two lines
                              // of one species, and "the line containing this
                              // id" found the older one under the newer's cross.
                              ? () => removeLineAt(cardIndex, cell.seat)
                              : undefined
                      }
                      removeLabel={cell.isLegend ? 'Remove the endgame boss legendary' : undefined}
                      onReset={
                        !inHand && custom && line
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
      <div
        data-fit-tail
        className="grid grid-cols-[0.75rem_1fr] gap-x-[0.375rem] gap-y-[3px] px-[0.375rem] pt-2 text-[0.625rem] leading-[1.35] text-muted-foreground"
      >
        {/* An empty card leads with how to fill it, and holds the legendary
            hint back: there is no line yet to put one over, so that hint
            would be instructions for a state the reader is not in. Once a
            line is placed the first hint has done its job and the legendary
            takes its place. */}
        {card.lines.length === 0 && (
          <>
            <Plus className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
            <span>Tap an empty slot to add an evolution line</span>
          </>
        )}
        <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>Drag a pokemon up or down in its column to shift when it evolves</span>
        <ArrowLeftRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>Press and hold then drag a column of pokemon to reorder it</span>
        {card.lines.length > 0 && (
          <>
            <LaurelIcon className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" />
            <span>
              {legendsOf(card).length > 0
                ? 'Drag an Endgame Boss legendary onto another column to move it'
                : 'Tap a pokemon in the Endgame Boss row to swap in a legendary'}
            </span>
          </>
        )}
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
