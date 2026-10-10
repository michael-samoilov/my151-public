import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { getLocale, localeUppercase, pokemonLabel, raw, t as translate, useNamesVersion, useT, type NoArgKey } from '@/i18n';
import { splitTemplate, type TemplatePart } from '@/lib/richTemplate';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import { HeldItems } from '@/components/shared/dragHold';
import { cn } from '@/lib/utils';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { useGridDragSensors } from '@/lib/dragSensors';
import { warmImages } from '@/lib/warmImages';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW, ROW_COUNT, TEAM_SIZES, joinRow } from '../model/constants';
import {
  defaultBoundaries,
  effectiveBoundaries,
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
import {
  formAt, formsFor, isPowerupRow, powerupSymbol, type PowerupForm, type PowerupKind, type PowerupSymbol,
} from '../model/powerups';
import { LaurelIcon } from './LaurelIcon';
import { BALL_OF_SPRITE, RING_OF_SPRITE, SPRITE_REM } from '../slotLayout';
import {
  ACE_SCALE, CAPTION_GAP_X_REM, CAPTION_GAP_Y_REM, CAPTION_HALO, CAPTION_LEADING, CAPTION_MIN_REM, fitHeadings,
  paneFace, seamBetween, showcaseSquares, SHOWCASE_PAD_REM, type Box, type CardGridRem, type HeadFace,
  type HeadLine, type SeamEnds,
} from '../showcaseLayout';
import { headingInline, headingLines, headingTracks } from '../slotHeadings';
import { FONT_STACK } from '../export/paint';
import { tmBodyShiftRem } from '../export/layout';
import { useSlotLab } from '../slotLab';
import { SPRITE_RENDERING, SPRITE_RENDERING_VAR } from '../spriteScale';
import { pokemonSpriteUrl } from '@/lib/spriteUrl';

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

/** The card labels' face. Their size is `text-[0.53125rem]` where they fit. */
const LABEL_FACE = 'font-extrabold tracking-[0.08em] leading-[1.4]';
const CARD_LABEL_CLASS = `text-[0.53125rem] ${LABEL_FACE}`;

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
const BAND_BEFORE: Record<number, { label: NoArgKey; note?: NoArgKey }> = {
  [ELITE_ROW]: { label: 'league.band.elite', note: 'league.band.eliteNote' },
  [BOSS_ROW]: { label: 'league.band.boss', note: 'league.band.bossNote' },
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

/** The smallest share of its size a band's note gives up before it is cut. */
const NOTE_MIN_SCALE = 0.7;

/**
 * A band: its label in the card's capitals, and the rule note after it.
 *
 * The note is one line in a fixed band, so where the room runs short (a 320px
 * phone, or a language that says it in more words) it takes a smaller face
 * rather than lose its last words to the band's edge. Where it fits, it keeps
 * the label's size and no style is set.
 */
function Band({ label, note }: { label: NoArgKey; note?: NoArgKey }) {
  const t = useT();
  const noteRef = useRef<HTMLSpanElement>(null);
  const noteText = note ? t(note) : '';
  useLayoutEffect(() => {
    const el = noteRef.current;
    if (!el) return;
    const fit = () => {
      el.style.fontSize = '';
      const room = el.clientWidth;
      const natural = el.scrollWidth;
      if (natural <= room + 0.5) return;
      const size = parseFloat(getComputedStyle(el).fontSize);
      el.style.fontSize = `${size * Math.max(NOTE_MIN_SCALE, room / natural)}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    document.fonts.addEventListener('loadingdone', fit);
    fit();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [noteText]);
  return (
    <div
      className="mx-[0.1875rem] flex items-center gap-[0.3125rem] rounded-[0.3125rem] px-2 text-white"
      style={{ height: `${BAND_H}rem`, background: 'var(--lg-band)' }}
    >
      <b className="whitespace-nowrap text-[0.5625rem] font-extrabold tracking-[0.07em]">{localeUppercase(t(label))}</b>
      {/* Same size and leading as the label, so the two sit on one baseline
          inside the centred band. */}
      {note && <span ref={noteRef} className="overflow-hidden whitespace-nowrap text-[0.5625rem] opacity-85">{noteText}</span>}
    </div>
  );
}

function GlyphCell({ row, span, cell }: { row: number; span: number; cell: string }) {
  const t = useT();
  let inner: React.ReactNode;
  if (row === 1) {
    inner = (
      <span className="flex flex-col items-center gap-[3px]">
        <span className={cn(CARD_LABEL_CLASS, 'text-white')}>{t('league.glyph.noBadges')}</span>
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
  /** How the card draws its sprites, which a portal does not inherit. */
  rendering: React.CSSProperties['imageRendering'];
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
    rendering: style.getPropertyValue(SPRITE_RENDERING_VAR).trim() as React.CSSProperties['imageRendering'] || undefined,
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

/** Column wash follows the pointer only on devices with a real hover pointer. */
const TRUE_HOVER =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : null;

function pointerMayColumnHover(e: React.PointerEvent): boolean {
  if (e.pointerType === 'touch') return false;
  if (!TRUE_HOVER?.matches) return false;
  return true;
}

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
  return pokemonSpriteUrl(form.id);
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
  const t = useT();
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
            style={{ width: `${SPRITE_REM}rem`, height: `${SPRITE_REM}rem`, imageRendering: SPRITE_RENDERING }}
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
              symbol={powerupSymbol(pokemon.id, 'mega')}
              active={powerupKind === 'mega'}
              onPress={() => onPowerup('mega')}
              side="left"
            />
          )}
          {formsFor(pokemon.id, 'dynamax').length > 0 && (
            <PowerupButton
              kind="dynamax"
              symbol={powerupSymbol(pokemon.id, 'dynamax')}
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
          aria-label={t('league.cell.reset', { name: pokemonLabel(pokemon.id, pokemon.name).name })}
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
          aria-label={removeLabel ?? t('league.cell.remove', { name: pokemonLabel(pokemon.id, pokemon.name).name })}
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
 *
 * The Primal orbs are round pixel art whose ink fills their 15px box, so
 * they take the same share and keep the same margin.
 */

/** The widest side of a symbol's ink, as a share of its own image box. */
const SYMBOL_INK: Record<PowerupSymbol, number> = { mega: 1, dynamax: 0.961, 'primal-kyogre': 1, 'primal-groudon': 1 };

/**
 * The orbs are pixel art, so they draw as the team sprites beside them do
 * (`SPRITE_RENDERING`); the Mega and Dynamax symbols are smooth art.
 */
const PIXEL_ART: ReadonlySet<PowerupSymbol> = new Set(['primal-kyogre', 'primal-groudon']);

/** How much of the disc that widest side may take. */
const SYMBOL_EXTENT = 0.8;

function symbolScale(symbol: PowerupSymbol): string {
  return `${((SYMBOL_EXTENT / SYMBOL_INK[symbol]) * 100).toFixed(1)}%`;
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
function PowerupButton({ kind, symbol, active, onPress, side }: {
  kind: PowerupKind;
  /** What the disc shows: the kind's own symbol, or a Primal's orb. */
  symbol: PowerupSymbol;
  active: boolean;
  onPress: () => void;
  /** Mega takes the cell's left corner, Dynamax its right. */
  side: 'left' | 'right';
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-label={t(kind === 'dynamax' ? 'league.powerup.dynamax' : symbol === 'mega' ? 'league.powerup.mega' : 'league.powerup.primal')}
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
          src={`/powerups/${symbol}.png`}
          alt=""
          className={cn('object-contain', !active && 'opacity-55')}
          style={{
            width: symbolScale(symbol),
            height: symbolScale(symbol),
            imageRendering: PIXEL_ART.has(symbol) ? SPRITE_RENDERING : undefined,
          }}
        />
      </span>
    </button>
  );
}

/**
 * Ace/partner cluster: a sprite and its caption.
 *
 * The ace pins top left and its caption centres on it; the partner pins
 * bottom right with its caption to its left, right-aligned and centred on
 * it (`showcaseLayout.ts`). Each caption's name comes last. Empty keeps the
 * sprite square and draws the ring inside it.
 */
function SlotHalf({
  testId, half, heading, fit, place, pokemon, onPick, onRemove,
}: {
  testId: string;
  half: 'ace' | 'partner';
  heading: Heading;
  fit: HalfFit;
  /**
   * Where the half sits in the pane: the ace's centre line and top, or the
   * partner's right edge and top, in pane px.
   */
  place: { left: number; top: number } | { right: number; top: number };
  pokemon: ReturnType<typeof getPokemonById>;
  onPick: () => void;
  onRemove: () => void;
}) {
  const mirrored = half === 'partner';
  const label = (
    <HeadRuns
      lines={heading.lines}
      className={cn(HEAD_CLASS, mirrored && 'text-right')}
      data-slot-head={half}
      style={{ color: pokemon ? 'var(--lg-band)' : 'var(--lg-hint)' }}
    />
  );
  const halfRef = useRef<HTMLButtonElement>(null);
  const lab = useSlotLab((st) => st.enabled);
  const slot = useSlotLab((st) => st.slot);
  const shift = useSlotLab((st) => st[half]);
  const nudge = useSlotLab((st) => st.nudge);
  const dragged = useRef(false);
  const offset = slot ? { x: shift.dx * slot.w, y: shift.dy * slot.h } : { x: 0, y: 0 };

  const onLabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!slot) return;
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    dragged.current = false;
    const from = { x: e.clientX, y: e.clientY };
    const rect = el.getBoundingClientRect();
    const scale = rect.width > 0 ? rect.width / el.offsetWidth : 1;
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
      setTimeout(() => { dragged.current = false; }, 0);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };

  const edge = mirrored ? 'var(--slot-unit)' : `calc(var(--slot-unit) * ${ACE_SCALE})`;
  const art = (
    <span
      data-slot-art
      className="relative flex shrink-0 items-center justify-center"
      style={{ width: edge, height: edge, ['--slot-sprite' as string]: edge }}
    >
      {pokemon ? (
        <>
          {/* The ball's two layers are squares turned 30 degrees, so their
              boxes reach past the ball on every side. The ball is a circle
              inside its own square, so cropping to that square paints the
              same and keeps the turned corners off the card's edge, which a
              2x ace near it would otherwise reach. */}
          <span
            aria-hidden="true"
            data-audit-clip="intended"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 overflow-hidden"
            style={{
              width: `calc(var(--slot-sprite) * ${BALL_OF_SPRITE})`,
              height: `calc(var(--slot-sprite) * ${BALL_OF_SPRITE})`,
            }}
          >
            <PokeballBg pokemon={pokemon} />
          </span>
          <img
            key={pokemon.sprite}
            src={pokemon.sprite}
            alt={pokemon.name}
            className="relative z-[1] h-full w-full max-w-none"
            style={{ imageRendering: SPRITE_RENDERING }}
          />
          <SlotRemove label={heading.remove} onRemove={onRemove} />
        </>
      ) : (
        <span
          data-slot-ring
          className="block"
          style={{
            width: `calc(var(--slot-sprite) * ${RING_OF_SPRITE})`,
            height: `calc(var(--slot-sprite) * ${RING_OF_SPRITE})`,
          }}
        >
          <EmptySlotBall size="100%" />
        </span>
      )}
    </span>
  );
  // An empty half has no name line, so the partner's heading alone centres
  // on its ball.
  const text = pokemon ? pokemonLabel(pokemon.id, pokemon.name).name : null;
  const clipped = fit.max > 0;
  const name = text !== null && (
    <span
      data-slot-name={half}
      className={cn('relative block w-max shrink-0 whitespace-nowrap', CAPTION_NAME_CLASS)}
      style={{
        // The names are in the page's text colour, the darkest the card page
        // draws (`text-foreground`); the labels keep the card's band colour.
        color: 'var(--color-foreground, #0a0a0a)',
        // A shrunk name keeps its line's height, so the lines around it
        // stay put.
        fontSize: fit.scale < 1 ? `max(${CAPTION_MIN_REM}rem, var(--cap-size) * ${fit.scale})` : undefined,
        lineHeight: `calc(var(--cap-size) * ${CAPTION_LEADING})`,
        letterSpacing: fit.tight ? 0 : undefined,
        maxWidth: clipped ? `${fit.max}px` : undefined,
        overflow: clipped ? 'hidden' : undefined,
        textOverflow: clipped ? 'ellipsis' : undefined,
      }}
    >
      {text}
    </span>
  );
  // The name at the caption size, unshrunk and unclipped, for the fit to
  // measure against its room.
  const probe = text !== null && (
    <span
      data-name-probe={half}
      aria-hidden="true"
      className={cn('pointer-events-none invisible absolute left-0 top-0 w-max whitespace-nowrap', CAPTION_NAME_CLASS)}
    >
      {text}
    </span>
  );
  const caption = (
    <span
      data-slot-caption={half}
      className={cn('relative flex shrink-0 flex-col', mirrored ? 'items-end' : 'items-center')}
      style={{ textShadow: CAPTION_HALO }}
    >
      {label}
      {name}
    </span>
  );
  return (
    <button
      ref={halfRef}
      type="button"
      onClick={(e) => {
        if (dragged.current) {
          e.preventDefault();
          return;
        }
        onPick();
      }}
      onPointerDown={lab ? onLabPointerDown : undefined}
      data-testid={testId}
      data-slot-half={half}
      aria-label={text !== null ? heading.filled(text) : heading.choose}
      className={cn(
        'absolute z-[6] flex items-center',
        mirrored ? 'flex-row' : 'flex-col',
        lab ? 'cursor-grab touch-none rounded outline-dashed outline-1 outline-offset-2' : 'cursor-pointer',
      )}
      style={{
        ...('left' in place ? { left: `${place.left}px` } : { right: `${place.right}px` }),
        top: `${place.top}px`,
        gap: mirrored ? `${CAPTION_GAP_X_REM}rem` : `${CAPTION_GAP_Y_REM}rem`,
        // The ace's block centres on its left edge; the lab's nudge rides
        // on top.
        transform: `translate(${'left' in place ? '-50%' : '0px'}, 0px) translate(${offset.x}px, ${offset.y}px)`,
        outlineColor: lab ? 'rgba(37,99,235,0.5)' : undefined,
      }}
    >
      {mirrored ? <>{caption}{art}</> : <>{art}{caption}</>}
      {probe}
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
 * `lines` is the drawn form, and the rest what a screen reader says for the
 * slot empty, filled, and for its remove button. The partner's two lines
 * are two names for one role, with the slash drawn so they read as
 * alternatives rather than a phrase; reading both out adds nothing, so it
 * is spoken as the partner. The ace's heading is one phrase on one line,
 * which leaves the seam the room a second line would take.
 */
interface Heading {
  readonly lines: readonly string[];
  readonly choose: string;
  readonly filled: (name: string) => string;
  readonly remove: string;
}

/**
 * The dashed outline an empty slot wears.
 *
 * An overlay rather than a border on the slot itself. A border is layout:
 * with `box-sizing: border-box` it takes its pixel from the inside, so every
 * slot's content sat one pixel further in while the slot was empty and
 * stepped back out the moment something was chosen. Nothing here takes part
 * in layout, so filling a slot moves nothing.
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

/** The card's grid as the signature pane reads it: the same rem the rows and cells use. */
const PANE_GRID: CardGridRem = { row: ROW_H, insetX: INSET_X, insetY: INSET_Y, padX: PAD_X, sprite: SPRITE_REM };

/** How one caption's name fits: its scale, its tracking, and its clip width. */
interface HalfFit {
  scale: number;
  /** The name's tracking has given way, as the heading's does below the floor. */
  tight: boolean;
  /** The clip width in pane px, or 0 for none. */
  max: number;
}
interface CaptionFit {
  ace: HalfFit;
  partner: HalfFit;
  /** The seam between the two sprites as drawn, or null before the first read. */
  seam: SeamEnds | null;
  /** What the headings allow the pane's face, or null before the first read. */
  head: HeadFace | null;
}
const WHOLE: HalfFit = { scale: 1, tight: false, max: 0 };
const UNFITTED: CaptionFit = { ace: WHOLE, partner: WHOLE, seam: null, head: null };

/** One half as drawn, in pane px. */
interface HalfRead {
  art: Box;
  name: Box | null;
  /** The name's width at the caption size, unshrunk. */
  natural: number;
  /** What the name's tracking adds to `natural`. */
  track: number;
  /** The caption size in px. */
  cap: number;
  /** The heading's box, and each of its lines untracked. */
  head: { box: Box; lines: Omit<HeadLine, 'room'>[]; cap: number };
}

function readPane(pane: HTMLElement): { w: number; h: number; ace: HalfRead; partner: HalfRead } {
  const origin = pane.getBoundingClientRect();
  const zoom = pane.offsetWidth > 0 ? origin.width / pane.offsetWidth : 1;
  const rel = (r: DOMRect): Box => ({
    x: (r.left - origin.left) / zoom,
    y: (r.top - origin.top) / zoom,
    w: r.width / zoom,
    h: r.height / zoom,
  });
  const read = (half: 'ace' | 'partner'): HalfRead => {
    const root = pane.querySelector<HTMLElement>(`[data-slot-half="${half}"]`)!;
    const nameEl = root.querySelector<HTMLElement>('[data-slot-name]');
    const probe = root.querySelector<HTMLElement>('[data-name-probe]');
    const headEl = root.querySelector<HTMLElement>('[data-slot-head]')!;
    const headStyle = getComputedStyle(headEl);
    // `normal`, as the CJK locales set it, reads as no tracking.
    const headTrack = parseFloat(headStyle.letterSpacing) || 0;
    const range = document.createRange();
    const headLines = [...headEl.children].map((line) => {
      range.selectNodeContents(line);
      const letters = [...(line.textContent ?? '')].length;
      return { width: range.getBoundingClientRect().width / zoom - letters * headTrack, letters };
    });
    return {
      art: rel(root.querySelector('[data-slot-art]')!.getBoundingClientRect()),
      name: nameEl ? rel(nameEl.getBoundingClientRect()) : null,
      natural: probe ? probe.getBoundingClientRect().width / zoom : 0,
      track: probe ? [...(probe.textContent ?? '')].length * (parseFloat(getComputedStyle(probe).letterSpacing) || 0) : 0,
      cap: probe ? parseFloat(getComputedStyle(probe).fontSize) : 0,
      head: { box: rel(headEl.getBoundingClientRect()), lines: headLines, cap: parseFloat(headStyle.fontSize) },
    };
  };
  return { w: pane.offsetWidth, h: pane.offsetHeight, ace: read('ace'), partner: read('partner') };
}

/**
 * A name of `natural` width, `track` of it tracking, in `room`: shrunk to
 * the floor, then untracked, as the heading gives way, then clipped. A name
 * up to a pixel over its room stays whole: an ellipsis would cost two
 * letters for it.
 */
function fitName(natural: number, track: number, room: number, cap: number, floor: number): HalfFit {
  if (natural <= room || cap <= 0) return WHOLE;
  const scale = Math.max(floor / cap, Math.floor((room / natural) * 200) / 200);
  const drawn = natural * scale;
  if (drawn <= room + 1) return { scale, tight: false, max: 0 };
  const tight = drawn - track * scale;
  return { scale, tight: true, max: tight > room + 1 ? Math.floor(Math.max(0, room)) : 0 };
}

/**
 * The next fit, from the pane as drawn. Each name and each heading has the
 * room across the pane that its caption can take: the ace's centred on the
 * ace, and the partner's from the pad to the partner. The seam does not
 * limit either; text may cross it.
 */
function solveFit(pane: HTMLElement, remPx: number): CaptionFit {
  const m = readPane(pane);
  const pad = SHOWCASE_PAD_REM * remPx;
  const floor = CAPTION_MIN_REM * remPx;
  const a = m.ace;
  const p = m.partner;
  // The ace's caption centres on the ace, so its room is twice the way to
  // the nearer side of the pane, less the pad.
  const aceCentre = a.art.x + a.art.w / 2;
  const aceRoom = 2 * (Math.min(aceCentre, m.w - aceCentre) - pad);
  const partnerRoom = p.head.box.x + p.head.box.w - pad;
  return {
    ace: fitName(a.natural, a.track, aceRoom, a.cap, floor),
    partner: p.name ? fitName(p.natural, p.track, p.name.x + p.name.w - pad, p.cap, floor) : WHOLE,
    seam: seamBetween(m.w, m.h, a.art, p.art, remPx),
    head: fitHeadings([
      ...a.head.lines.map((line) => ({ ...line, room: aceRoom })),
      ...p.head.lines.map((line) => ({ ...line, room: partnerRoom })),
    ], a.head.cap),
  };
}

const sameHalf = (a: HalfFit, b: HalfFit) =>
  a.tight === b.tight && Math.abs(a.scale - b.scale) < 0.004 && Math.abs(a.max - b.max) < 1;
const sameSeam = (a: SeamEnds | null, b: SeamEnds | null) =>
  a === b || (!!a && !!b && (['x1', 'y1', 'x2', 'y2'] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-3));
const sameHead = (a: HeadFace | null, b: HeadFace | null) =>
  a === b || (!!a && !!b && (a.size === b.size || Math.abs(a.size - b.size) < 0.01) && Math.abs(a.track - b.track) < 0.01);

/** The captions' fit and the seam, read from the pane as drawn. */
function useCaptionFit(ref: React.RefObject<HTMLDivElement | null>): CaptionFit {
  const [fit, setFit] = useState(UNFITTED);
  const [tick, setTick] = useState(0);
  // Anything that moves a box the fit reads resizes one of these: the pane,
  // a sprite square, a caption, or a name (a new Pokémon, a new locale, a
  // webfont landing late). Re-read on every render, since a name's element
  // can be replaced.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTick((n) => n + 1));
    ro.observe(el);
    const parts = el.querySelectorAll('[data-slot-art], [data-slot-caption], [data-slot-head], [data-slot-name], [data-name-probe]');
    for (const c of parts) ro.observe(c);
    return () => ro.disconnect();
  });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const next = solveFit(el, getAppliedRootFontSizePx());
    const same = sameHalf(next.ace, fit.ace) && sameHalf(next.partner, fit.partner) && sameSeam(next.seam, fit.seam)
      && sameHead(next.head, fit.head);
    if (!same) setFit(next);
  }, [ref, fit, tick]);
  return fit;
}

// The card's label face, at the caption size the pane sets (`paneFace`).
const HEAD_CLASS = 'text-[length:var(--cap-size)] font-extrabold tracking-[var(--cap-track)] leading-[1.4]';
// The name wears the heading's all-caps, weight and size, so it reads as part
// of the same label. Its tracking is tighter, though: the heading is two short
// words that a wide track sets off, while the name is one long word that the
// same track would push past the seam — a ten-letter starter like Charmander
// clears the box at this spacing and clips at the heading's.
const NAME_CLASS = 'text-[0.53125rem] font-extrabold tracking-[0.02em] leading-[1.4] uppercase';
/** The ace's and partner's names: `NAME_CLASS` at the pane's caption size. */
const CAPTION_NAME_CLASS = 'text-[length:var(--cap-size)] font-extrabold tracking-[0.02em] leading-[1.4] uppercase';

/**
 * A heading, one line per run. Each line is nowrap, so PARTNER / and
 * SHOULDERMON stay two lines of whole words.
 */
function HeadRuns({ lines, className, style, ...rest }: {
  lines: readonly string[];
  className?: string;
  style?: React.CSSProperties;
  'data-slot-head'?: string;
}) {
  return (
    <span
      {...rest}
      className={cn('inline-block w-max shrink-0 text-center', className)}
      style={style}
    >
      {lines.map((line, i) => (
        <span key={i} className="block shrink-0 whitespace-nowrap">{line}</span>
      ))}
    </span>
  );
}

/**
 * Slot size for the seam SVG and the slot lab. Not a placement solve: the
 * clusters pin with CSS.
 */
function useSlotBox(ref: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState<[number, number]>([1, 1]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      if (w < 8 || h < 8) return;
      setBox((prev) => (prev[0] === w && prev[1] === h ? prev : [w, h]));
      useSlotLab.getState().setSlot(w, h);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

function AcePartnerSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const setSignatureSeat = useLeagueStore((s) => s.setSignatureSeat);
  const setPartner = useLeagueStore((s) => s.setPartner);
  useNamesVersion();
  const t = useT();
  const aceHead: Heading = {
    lines: [headingInline('ace')],
    choose: t('league.slot.ace.choose'),
    filled: (name) => t('league.slot.ace.filled', { name }),
    remove: t('league.slot.ace.remove'),
  };
  const partnerHead: Heading = {
    lines: headingLines('partner'),
    choose: t('league.slot.partner.choose'),
    filled: (name) => t('league.slot.partner.filled', { name }),
    remove: t('league.slot.partner.remove'),
  };
  const { card } = view;
  const line = card.signatureSeat !== null ? card.lines[card.signatureSeat - 1] : undefined;
  const shown = signatureMember(line, card.signatureId ?? null);
  const ace = shown !== null ? getPokemonById(shown) : undefined;
  const partner = card.partnerId != null ? getPokemonById(card.partnerId) : undefined;
  const slotRef = useRef<HTMLDivElement>(null);
  const box = useSlotBox(slotRef);
  const labSprite = useSlotLab((st) => (st.enabled ? st.sprite : 0));
  const remPx = getAppliedRootFontSizePx();
  // The partner is one cell sprite on the pane's right column and bottom
  // row, and the ace two on its top-left 2x2 cells (`showcaseLayout.ts`).
  const squares = showcaseSquares(box[0], remPx, PANE_GRID);
  const unitPx = labSprite > 0 ? labSprite : squares.partner.size;
  const partnerPlace = {
    right: box[0] - (squares.partner.cx + squares.partner.size / 2),
    top: squares.partner.cy - squares.partner.size / 2,
  };
  const fit = useCaptionFit(slotRef);
  const face = paneFace(fit.head);
  const seam = fit.seam ?? { x1: 0, y1: 1, x2: 1, y2: 0 };
  const pos = {
    ...slotX(1, 3),
    top: `${rowTop(1) + INSET_Y}rem`,
    height: `${4 * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <div
      ref={slotRef}
      data-ace-partner-slot
      data-showcase={ace && partner ? 'pair' : ace || partner ? 'split' : 'empty'}
      data-slot-sprite={ACE_SCALE * unitPx}
      className="absolute z-[5] rounded-lg"
      style={{
        ...pos,
        ['--slot-unit' as string]: `${unitPx}px`,
        containerType: 'inline-size',
        ['--cap-size' as string]: face.size,
        ['--cap-track' as string]: face.track,
        background: ace || partner ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!(ace || partner) && <EmptyOutline />}
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
        testId="slot-ace"
        half="ace"
        heading={aceHead}
        fit={fit.ace}
        place={{ left: squares.ace.cx, top: squares.ace.cy - squares.ace.size / 2 }}
        pokemon={ace}
        onPick={() => openLeagueBrowser(cardIndex, 'signature')}
        onRemove={() => setSignatureSeat(cardIndex, null, null)}
      />
      <SlotHalf
        testId="slot-partner"
        half="partner"
        heading={partnerHead}
        fit={fit.partner}
        place={partnerPlace}
        pokemon={partner}
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
/**
 * The glyph column, capped as a share of the box.
 *
 * A fixed rem width is wrong here: the box is two of the card's seven columns
 * and the card's width is not fixed, so at a 320px viewport a 2.75rem column
 * took most of the box and the badge name was down to two characters. The cap
 * keeps the glyph from eating the text it labels; both slots use the same
 * expression, so the disc and the hexagon stay on one axis whatever binds.
 *
 * The labels do not widen it. A column grown to fit BADGE took the room the
 * move's type and category need, and cut the category chip at the slot edge.
 *
 * In `cqw` of the box, which is an inline-size container, rather than `%`, so
 * the labels can be sized from the same expression. Both resolve against the
 * box's content width.
 */
const MARK_COL = 'min(2.75rem, 26cqw)';
/**
 * The size of the four words in the pair: TM and BADGE under the glyphs, and
 * the "Pick a move" and NAME placeholders beside them.
 *
 * As large as fits, from the 0.4rem production drew these at up to the ace
 * heading's 0.53125rem. The word under the glyph is centred on the column and
 * may reach into the pad and the gap, stopping 0.125rem short of the box's
 * edge, where the empty box draws its dashed outline, and of the text. BADGE,
 * the widest, is 3.92em at this face, so the size is that room over 3.92. The
 * placeholders take the same size, so the pair keeps one size of label.
 */
const MARK_LABEL_ROOM = `(${MARK_COL} + ${MARK_PAD} + ${MARK_GAP} - 0.25rem)`;
/**
 * The labels' tracking: the face's 0.08em wherever the size above fits.
 *
 * On a 320px phone the room is under 3.92 × 0.4rem, and the floor would push
 * BADGE onto the empty box's dashed outline. There the tracking gives way
 * instead, down to production's none: BADGE is 3.52em untracked, and its five
 * letters share what the room has left.
 */
const MARK_LABEL_TYPE = 'text-[length:var(--mark-label)] font-extrabold tracking-[var(--mark-track)] leading-[1.4]';
const MARK_LABEL_CLASS = `shrink-0 whitespace-nowrap ${MARK_LABEL_TYPE}`;

/**
 * The wider of the two words under the glyphs, at the label face: its width
 * untracked in em, and its letter count, which the tracking is paid per.
 */
interface MarkWord {
  natural: number;
  letters: number;
  /** Japanese, Korean and Chinese set no tracking (`:lang()` in index.css). */
  tracked: boolean;
}
/** English, measured once and pinned: BADGE is 3.52em untracked, five letters. */
const EN_MARK_WORD: MarkWord = { natural: 3.52, letters: 5, tracked: true };
const markWordCache = new Map<string, MarkWord>();

/**
 * Every other language measures its own two words, TM's and the badge's, since
 * either can be the wider: MEDAGLIA under the hexagon, わざマシン under the disc.
 */
function markWord(fontsLoaded: boolean): MarkWord {
  const locale = getLocale();
  if (locale === 'en') return EN_MARK_WORD;
  const key = `${locale}:${fontsLoaded}`;
  const cached = markWordCache.get(key);
  if (cached) return cached;
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return EN_MARK_WORD;
  ctx.font = `800 100px ${FONT_STACK}`;
  const tracked = headingTracks();
  // A word the catalog breaks with a newline stands in two lines; the wider line counts.
  const words = [translate('league.tm.mark'), translate('league.badge.mark')].flatMap((w) => localeUppercase(w).split('\n'));
  const measured = words.map((word) => ({ natural: ctx.measureText(word).width / 100, letters: [...word].length, tracked }));
  const width = (w: MarkWord) => w.natural + (w.tracked ? 0.08 * w.letters : 0);
  const widest = measured.reduce((a, b) => (width(b) > width(a) ? b : a));
  markWordCache.set(key, widest);
  return widest;
}

const round = (n: number) => String(Number(n.toFixed(3)));

/**
 * A word under a glyph, in the lines its catalog value gives it. わざマシン
 * and 招式学习器 stand in two lines, so the column sets them larger than one
 * five-character line would allow; TM and BADGE stay one line of text.
 */
function MarkLines({ text }: { text: string }) {
  const lines = text.split('\n');
  if (lines.length === 1) return <>{text}</>;
  return (
    <>
      {lines.map((line, i) => (
        <span key={i} className="block text-center">{line}</span>
      ))}
    </>
  );
}

/**
 * What the TM box and the badge box share.
 *
 * The label size is as large as fits: the room over the wider word's tracked
 * width. Where even 0.4rem leaves the word wider than the room, the tracking
 * gives way first, down to none. A word longer than BADGE may go below 0.4rem
 * rather than spill onto the box's edge and the text beside it.
 */
function markBoxStyle(word: MarkWord): React.CSSProperties {
  const em = word.natural + (word.tracked ? 0.08 * word.letters : 0);
  const floor = word === EN_MARK_WORD ? '0.4rem' : `min(0.4rem, ${MARK_LABEL_ROOM} / ${round(word.natural)})`;
  return {
    paddingLeft: MARK_PAD,
    gap: MARK_GAP,
    containerType: 'inline-size',
    '--mark-label': `clamp(${floor}, ${MARK_LABEL_ROOM} / ${round(em)}, 0.53125rem)`,
    '--mark-track': word.tracked
      ? `clamp(0rem, (${MARK_LABEL_ROOM} - ${round(word.natural)} * var(--mark-label)) / ${word.letters}, 0.08em)`
      : '0rem',
  } as React.CSSProperties;
}

/** `markBoxStyle` for the active locale, measured again once the fonts land. */
function useMarkBoxStyle(): React.CSSProperties {
  const t = useT();
  const [fontsLoaded, setFontsLoaded] = useState(() => typeof document === 'undefined' || document.fonts?.status === 'loaded');
  useEffect(() => {
    if (fontsLoaded || !document.fonts) return;
    let live = true;
    void document.fonts.ready.then(() => {
      if (live) setFontsLoaded(true);
    });
    return () => {
      live = false;
    };
  }, [fontsLoaded]);
  return useMemo(() => {
    void t;
    return markBoxStyle(markWord(fontsLoaded));
  }, [t, fontsLoaded]);
}

/**
 * The last space does not break, so "Pick a / move" never strands the noun.
 * A two-word phrase keeps its one break: German "Attacke w\u00e4hlen" would
 * otherwise run past the slot's edge as one unbreakable word.
 */
const keepLastWord = (text: string) =>
  (text.trim().match(/\s+/g) ?? []).length >= 2 ? text.replace(/ (\S+)$/u, '\u00a0$1') : text;

function TmSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const t = useT();
  const markStyle = useMarkBoxStyle();
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const setTm = useLeagueStore((s) => s.setTm);
  const move = view.card.tmMoveId !== null ? getMoveById(view.card.tmMoveId) : undefined;
  const nameRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.fontSize = '';
    if (!move || /\s/.test(move.name.trim())) return;
    const fit = () => {
      el.style.fontSize = '';
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const zoom = box.width / parseFloat(style.width);
      const range = document.createRange();
      range.selectNodeContents(el);
      const cap = parseFloat(style.fontSize);
      const room = box.width - parseFloat(style.paddingRight) * zoom;
      el.style.fontSize = `${cap * fitName(range.getBoundingClientRect().width, 0, room, cap, 0).scale}px`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    document.fonts.addEventListener('loadingdone', fit);
    fit();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [move]);
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
        ...markStyle,
        background: move ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!move && <EmptyOutline />}
      <span
        className="flex shrink-0 flex-col items-center justify-center"
        style={{ width: MARK_COL }}
      >
        {/* Glyph size is capped in rem so a wider label column cannot grow
            the disc. 1.375rem is 72% of the 2.75rem column production used. */}
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
          data-mark-label="tm"
          style={{ color: move ? cardShades(move.type).band : 'var(--lg-hint)', whiteSpace: 'nowrap' }}
        >
          <MarkLines text={localeUppercase(t('league.tm.mark'))} />
        </span>
      </span>
      {move ? (
        <span
          className="flex min-w-0 flex-col items-start gap-[2px] overflow-hidden"
          style={{ transform: `translateY(${tmBodyShiftRem()}rem)` }}
        >
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
          {/* Long names wrap at spaces; a single word shrinks to fit.
              Keep the nominal line box (0.53125rem × 1.4) while its glyphs shrink. */}
          <span
            ref={nameRef}
            lang="en"
            data-tm-name=""
            className={cn(
              'min-w-0 w-full max-w-full text-left',
              NAME_CLASS,
              /\s/.test(move.name.trim()) ? 'whitespace-normal break-normal' : 'whitespace-nowrap',
            )}
            style={{ paddingRight: MARK_TRAIL, color: cardShades(move.type).band, lineHeight: '0.74375rem' }}
          >
            {move.name}
          </span>
        </span>
      ) : (
        // Free to wrap, unlike the other labels: it is three words beside
        // the disc, and at the full label size it is wider than the text
        // column on a phone. The space before "move" does not break, so a
        // wrap reads "Pick / a move" rather than stranding the noun.
        <span
          className={cn('min-w-0 text-left normal-case', MARK_LABEL_TYPE)}
          style={{ color: 'var(--lg-hint)' }}
        >
          {keepLastWord(t('league.tm.pick'))}
        </span>
      )}
      {move && <SlotRemove label={t('league.tm.remove')} onRemove={() => setTm(cardIndex, null)} />}
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

/**
 * The badge word on each side of the name, from `league.badge.phrase`.
 *
 * English sets " Badge" after the name, French "Badge " before it, and
 * Japanese "バッジ" after it with no space. The word after the name rides in
 * the field as its suffix; a word before the name sits ahead of the field.
 */
function badgeAffix(): { before: string; after: string } {
  const parts = splitTemplate(raw('league.badge.phrase'));
  const at = parts.findIndex((p) => p.kind === 'slot');
  const text = (list: TemplatePart[]) => list.map((p) => (p.kind === 'literal' ? p.text : '')).join('');
  if (at < 0) return { before: '', after: text(parts) };
  return { before: text(parts.slice(0, at)), after: text(parts.slice(at + 1)) };
}

function badgeSuffixEl(field: HTMLElement): HTMLElement | null {
  return field.querySelector<HTMLElement>('[data-badge-suffix]');
}

function makeBadgeSuffix(text: string): HTMLElement {
  const suffix = document.createElement('span');
  suffix.dataset.badgeSuffix = '';
  suffix.setAttribute('contenteditable', 'false');
  suffix.textContent = text;
  return suffix;
}

function badgeNameFromField(field: HTMLElement): string {
  const suffix = badgeSuffixEl(field);
  const raw = field.textContent ?? '';
  const text = suffix?.textContent ?? '';
  if (!suffix || !text) return raw;
  return raw.endsWith(text) ? raw.slice(0, -text.length) : raw;
}

function writeBadgeField(field: HTMLElement, next: string, suffix: string) {
  field.replaceChildren();
  if (next) {
    field.append(document.createTextNode(next));
    if (suffix) field.append(makeBadgeSuffix(suffix));
  }
}

function badgeSuffixVisible(box: HTMLElement, field: HTMLElement): boolean {
  if (box.scrollHeight > box.clientHeight + 1) return false;
  const suffix = badgeSuffixEl(field);
  if (!suffix) return true;
  const br = box.getBoundingClientRect();
  return [...suffix.getClientRects()].every((r) => (
    r.width < 0.5
    || (r.left >= br.left - 1 && r.right <= br.right + 1 && r.top >= br.top - 1 && r.bottom <= br.bottom + 1)
  ));
}

function clampBadgeName(field: HTMLElement, box: HTMLElement, name: string, suffix: string): string {
  let next = name;
  writeBadgeField(field, next, suffix);
  while (next && !badgeSuffixVisible(box, field)) {
    next = next.slice(0, -1);
    writeBadgeField(field, next, suffix);
  }
  const trimmed = next.replace(/[\s\u00a0]+$/u, '');
  if (trimmed !== next) {
    writeBadgeField(field, trimmed, suffix);
    if (badgeSuffixVisible(box, field)) return trimmed;
    writeBadgeField(field, next, suffix);
  }
  return next;
}

function BadgeSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const t = useT();
  const markStyle = useMarkBoxStyle();
  const { before: badgePrefix, after: badgeSuffix } = badgeAffix();
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
    const box = textRef.current;
    if (!el || !box || document.activeElement === el) return;
    const clamped = clampBadgeName(el, box, name, badgeSuffix);
    accepted.current = clamped;
    if (clamped !== name) setBadgeName(cardIndex, clamped);
  }, [name, cardIndex, setBadgeName, badgeSuffix, badgePrefix]);

  const putCaretAtEnd = () => {
    const el = fieldRef.current;
    if (!el) return;
    const suffix = badgeSuffixEl(el);
    const range = document.createRange();
    if (suffix) {
      range.setEndBefore(suffix);
      range.collapse(false);
    } else {
      range.selectNodeContents(el);
      range.collapse(false);
    }
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  const onInput = () => {
    const el = fieldRef.current;
    const box = textRef.current;
    if (!el || !box) return;
    let next = badgeNameFromField(el);
    if (next && badgeSuffix && !badgeSuffixEl(el)) {
      el.appendChild(makeBadgeSuffix(badgeSuffix));
      next = badgeNameFromField(el);
    }
    if (!next && badgeSuffixEl(el)) writeBadgeField(el, '', badgeSuffix);
    // Stored exactly as the field holds it. Normalizing here — collapsing
    // runs of space, say — makes the store and the DOM disagree on the very
    // next render, and the only way to reconcile that is to rewrite the
    // field, which throws the caret back to the start. A browser inserts a
    // non-breaking space for a trailing one, so a normalizing field
    // scrambles its own text the moment you type two words.
    // The suffix is already in the box by the second character, so the box
    // measures the phrase the reader will see, not just the name.
    const fits = next.length <= BADGE_NAME_CEILING && badgeSuffixVisible(box, el);
    if (!fits) {
      writeBadgeField(el, accepted.current, badgeSuffix);
      putCaretAtEnd();
      return;
    }
    accepted.current = next;
    setBadgeName(cardIndex, next);
    requestAnimationFrame(putCaretAtEnd);
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
        ...markStyle,
        background: name ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)',
      }}
    >
      {!name && <EmptyOutline />}
      {/* The same column the TM slot uses, so the hexagon sits under the disc
          and the word under the word. */}
      <span
        className="flex shrink-0 flex-col items-center justify-center"
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
        {/* The name ends in "Badge", so this word is redundant the moment a
            name is typed. It collapses away then — a grid row eased from 1fr
            to 0fr takes its height smoothly whatever it measures — and the
            hexagon, centred in the column, eases into the space it leaves.
            `grid-cols-1` holds the one track to the column's width: a BADGE
            wider than the column then spills evenly on both sides and stays
            on the hexagon's axis, where an auto track grew to the right. */}
        <span
          className="grid w-full min-w-0 grid-cols-1 justify-items-center transition-[grid-template-rows] duration-300 ease-out"
          style={{ gridTemplateRows: name ? '0fr' : '1fr' }}
        >
          <span
            className={cn('-mt-[0.0625rem] transition-opacity duration-300 ease-out', MARK_LABEL_CLASS)}
            data-mark-label="badge"
            style={{ color: 'var(--lg-hint)', opacity: name ? 0 : 1, minHeight: 0, whiteSpace: 'nowrap' }}
          >
            <MarkLines text={localeUppercase(t('league.badge.mark'))} />
          </span>
        </span>
      </span>
      <div
        ref={textRef}
        // Three lines. The box is 1.5 rows -- 4.3125rem -- and three lines of
        // this all-caps size come to ~2.23rem, so the height is not what limits
        // the name; the width beside the hexagon is. Capping at two lines threw
        // away a third of the room for nothing, and at a narrow width that left
        // six characters. The height is still fixed rather than free, so
        // `scrollHeight` has something to exceed and a name cannot grow past
        // the box.
        className={cn(
          'min-w-0 flex-1 overflow-hidden pr-[0.25rem] text-left',
          name ? NAME_CLASS : 'text-[0.5rem] font-extrabold leading-[1.2]',
        )}
        style={{ maxHeight: `${3 * 0.53125 * 1.4}rem`, color: 'var(--lg-band)' }}
      >
        {/* A badge word that goes before the name, as French and Spanish set
            it, rides ahead of the field in the same text flow. */}
        {name && badgePrefix && <span data-badge-prefix="">{badgePrefix}</span>}
        <span
          ref={fieldRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-label={t('league.badge.label')}
          spellCheck={false}
          onInput={onInput}
          onFocus={putCaretAtEnd}
          // The placeholder is the field's own `::before` rather than a
          // sibling: an empty inline span is zero-wide, which leaves nothing
          // to tap and nowhere obvious for the caret to sit.
          data-badge-field
          data-placeholder={localeUppercase(t('league.badge.placeholder'))}
          className={cn('outline-none', !name && MARK_LABEL_CLASS)}
        />
      </div>
      {name && (
        <SlotRemove
          label={t('league.badge.remove')}
          onRemove={() => {
            setBadgeName(cardIndex, '');
            const field = fieldRef.current;
            if (field) writeBadgeField(field, '', badgeSuffix);
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
  const t = useT();

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
    face: { width: number; height: number; radius: number; shadow: string; rendering?: React.CSSProperties['imageRendering'] };
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
        rendering: cell?.rendering,
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
        initial: [...effectiveBoundaries(line)], painted: false,
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
  const browserOpen = useLeagueUi((s) => s.browserOpen);
  useEffect(() => {
    let open = useLeagueUi.getState().browserOpen;
    return useLeagueUi.subscribe((state) => {
      if (state.browserOpen === open) return;
      open = state.browserOpen;
      setHoverSeat(null);
    });
  }, []);
  const onGridPointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointerMayColumnHover(e)) return;
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
        onPointerMove={onGridPointerMove}
        onPointerLeave={() => setHoverSeat(null)}
      >
        <AcePartnerSlot cardIndex={cardIndex} view={view} />
        <TmSlot cardIndex={cardIndex} view={view} />
        <BadgeSlot cardIndex={cardIndex} view={view} />
        <Band label="league.band.team" />
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
                    && effectiveBoundaries(line).join() !== defaultBoundaries(line.branch).join();
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
                      columnHovered={!browserOpen && !inHand && stageDrag === null && !legendDrag && hoverSeat === cell.seat}
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
                      removeLabel={cell.isLegend ? t('league.cell.removeLegend') : undefined}
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
            <span>{t('league.hint.add')}</span>
          </>
        )}
        <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>{t('league.hint.evolve')}</span>
        <ArrowLeftRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>{t('league.hint.reorder')}</span>
        {card.lines.length > 0 && (
          <>
            <LaurelIcon className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" />
            <span>
              {legendsOf(card).length > 0 ? t('league.hint.legendMove') : t('league.hint.legendAdd')}
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
                    style={{ width: held.sprite, height: held.sprite, imageRendering: held.face.rendering ?? 'pixelated' }}
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
