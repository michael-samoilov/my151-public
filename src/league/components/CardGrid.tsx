import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowLeftRight, ArrowUpDown, RotateCcw } from 'lucide-react';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel } from '@/i18n';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { TYPE_COLORS } from '@/data/type-colors';
import type { TypeName } from '@/types/pokemon';
import { cn } from '@/lib/utils';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW, ROW_COUNT, TEAM_SIZES, joinRow } from '../model/constants';
import { defaultBoundaries, deriveRows, moveSeat as reorderLines, stageAt } from '../model/engine';
import { getMoveById } from '../moves';
import { CategoryChip } from './CategoryChip';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { openLeagueBrowser } from '../store/browserBridge';
import type { CardView } from '../useCardView';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars, TmDisc } from './glyphs';
import { LaurelIcon } from './LaurelIcon';

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
}

function PokemonCell({ cardIndex, datum, pokemonId, lifted, ringWhenOver, onRemove, onReset }: {
  cardIndex: number;
  datum: CellDatum;
  pokemonId: number | null;
  /** The column previewed at its drop seat during a reorder drag. */
  lifted: boolean;
  /** A legendary drag is in flight; boss-row cells ring under the pointer. */
  ringWhenOver: boolean;
  /** Set on the column's topmost pokemon: remove this evo line. */
  onRemove?: () => void;
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
    }
  };

  // Boundary paints repaint cells in place; a ring marks a target only for
  // the legendary retarget, whose drop is not previewable.
  const ringed = isOver && ringWhenOver && datum.row === BOSS_ROW;

  return (
    <div
      ref={setDropRef}
      className="relative flex h-full items-center justify-center"
      style={{ zIndex: lifted ? 10 : undefined }}
    >
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
          lifted && 'scale-[1.04] shadow-lg ring-1 ring-black/10',
          ringed && 'ring-2 ring-[var(--lg-cell)]',
        )}
        style={{
          width: `calc(100% - ${2 * INSET_X}rem)`,
          height: `${ROW_H - 2 * INSET_Y}rem`,
          background: 'var(--lg-slot)',
          touchAction: 'none',
        }}
      >
        {pokemon ? (
          <img
            src={pokemon.sprite}
            alt={pokemon.name}
            className="pointer-events-none max-w-none"
            style={{ width: `${SPRITE_REM}rem`, height: `${SPRITE_REM}rem`, imageRendering: 'pixelated' }}
          />
        ) : (
          <EmptySlotBall />
        )}
        {datum.isLegend && (
          <span className="absolute bottom-[1px] text-[0.5rem] font-bold" style={{ color: 'var(--lg-band)' }}>
            ↔
          </span>
        )}
      </button>
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
          className="absolute left-0 top-[0.175rem] z-[15] flex h-[0.95rem] w-[0.95rem] cursor-pointer items-center justify-center rounded-full bg-[#2563eb]"
        >
          <RotateCcw className="h-[0.6rem] w-[0.6rem] text-white" strokeWidth={3} />
        </button>
      )}
      {onRemove && pokemon && (
        <button
          type="button"
          aria-label={`Remove ${pokemon.name}'s line`}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute right-0 top-[0.175rem] z-[15] h-[0.95rem] w-[0.95rem] cursor-pointer"
        >
          <RedXIcon className="h-full w-full" />
        </button>
      )}
    </div>
  );
}

function SignatureSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const { card } = view;
  const line = card.signatureSeat !== null ? card.lines[card.signatureSeat - 1] : undefined;
  const shown = line ? line.branch[stageAt(line, BOSS_ROW)] : null;
  const pokemon = shown !== null ? getPokemonById(shown) : undefined;
  const pos = {
    ...slotX(1, 3),
    top: `${rowTop(1) + INSET_Y}rem`,
    height: `${4 * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <button
      type="button"
      onClick={() => openLeagueBrowser(cardIndex, 'signature')}
      className={cn(
        'absolute z-[5] flex flex-col items-center rounded-lg',
        pokemon ? 'bg-white' : 'border border-dashed',
      )}
      style={{ ...pos, borderColor: pokemon ? undefined : 'var(--lg-dash)', background: pokemon ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)' }}
    >
      {pokemon ? (
        <>
          <span className="pt-[0.375rem] text-[0.53125rem] font-extrabold tracking-[0.08em]" style={{ color: 'var(--lg-band)' }}>
            SIGNATURE POKÉMON
          </span>
          <span className="flex flex-1 flex-col items-center justify-center">
            <img
              src={pokemon.sprite}
              alt={pokemon.name}
              className="max-w-none"
              style={{ width: '5.75rem', height: '5.75rem', imageRendering: 'pixelated' }}
            />
            <span className="text-[0.875rem] font-medium leading-tight">{pokemonLabel(pokemon.id, pokemon.name).name}</span>
            <span className="mt-[0.3125rem] flex flex-col items-center gap-[2px]">
              {pokemon.types.map((t) => (
                <TypeBadge key={t} type={t as TypeName} className="w-[5.25rem]" />
              ))}
            </span>
          </span>
        </>
      ) : (
        <span className="flex flex-1 flex-col items-center justify-center gap-[0.375rem]">
          <svg viewBox="0 0 16 16" className="h-[1.375rem] w-[1.375rem]">
            <line x1="3" y1="8" x2="13" y2="8" stroke="var(--lg-dash)" strokeWidth="1.8" strokeLinecap="round" />
            <line x1="8" y1="3" x2="8" y2="13" stroke="var(--lg-dash)" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <span className="text-[0.59375rem] font-bold tracking-[0.06em]" style={{ color: 'var(--lg-hint)' }}>
            SIGNATURE POKÉMON
          </span>
        </span>
      )}
    </button>
  );
}

function TmSlot({ view }: { view: CardView }) {
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const move = view.card.tmMoveId !== null ? getMoveById(view.card.tmMoveId) : undefined;
  const pos = {
    ...slotX(1, 2),
    top: `${rowTop(5) + INSET_Y}rem`,
    height: `${ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <button
      type="button"
      onClick={() => setMovePickerOpen(true)}
      className={cn('absolute z-[5] flex items-center gap-[0.375rem] rounded-lg pl-[0.375rem]', !move && 'border border-dashed')}
      style={{ ...pos, borderColor: move ? undefined : 'var(--lg-dash)', background: move ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)' }}
    >
      <span className="flex shrink-0 flex-col items-center">
        {/* The disc wears the move's own type, not the gym's — a TM is the
            move, and the gym's colour is already the whole card. Empty, it
            matches the badge hexagon's stroke rather than the cell fill. */}
        <TmDisc colour={move ? TYPE_COLORS[move.type] : 'var(--lg-dash)'} />
        {/* The disc's viewBox carries its own padding, so the label is pulled
            back up against it. */}
        <span
          className="-mt-[0.1875rem] text-[0.5rem] font-extrabold tracking-[0.06em]"
          style={{ color: 'var(--lg-hint)' }}
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
    top: `${rowTop(6) + INSET_Y}rem`,
    height: `${2 * ROW_H - 2 * INSET_Y}rem`,
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
      className={cn('absolute z-[5] flex cursor-text flex-col items-center justify-center gap-[0.375rem] rounded-lg', !name && 'border border-dashed')}
      style={{ ...pos, borderColor: name ? undefined : 'var(--lg-dash)', background: name ? 'var(--lg-slot)' : 'rgba(255,255,255,0.65)' }}
    >
      <svg viewBox="0 0 32 32" className="h-[2.375rem] w-[2.375rem]">
        <path
          d="M16 3 L27 9.5 L27 22.5 L16 29 L5 22.5 L5 9.5 Z"
          fill={name ? 'var(--lg-cell)' : 'none'}
          stroke={name ? 'none' : 'var(--lg-dash)'}
          strokeWidth="1.6"
          strokeDasharray={name ? undefined : '3 2.4'}
        />
        <circle cx="16" cy="16" r="4.4" fill={name ? '#ffffff' : 'none'} stroke={name ? 'none' : 'var(--lg-dash)'} strokeWidth="1.6" />
      </svg>
      <div
        ref={textRef}
        // Three lines is what the slot has under the hexagon. The height is
        // fixed rather than free so `scrollHeight` has something to exceed.
        className="w-[5.25rem] overflow-hidden text-center text-[0.65625rem] leading-tight"
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
  const removeLineWith = useLeagueStore((s) => s.removeLineWith);
  const { card, shades, rows } = view;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const paintRef = useRef<PaintDrag | null>(null);
  const [previewMove, setPreviewMove] = useState<{ from: number; to: number } | null>(null);
  // The legendary drag carries a copy under the pointer. Its size comes from
  // the cell it was lifted from, measured in client pixels, because the card
  // sits under a CSS `zoom` and the overlay is portalled out of it.
  const [legendDrag, setLegendDrag] = useState<{ sprite: number } | null>(null);

  const onDragStart = useCallback(
    (e: DragStartEvent) => {
      const d = e.active.data.current as CellDatum | undefined;
      if (!d) return;
      if (d.isLegend) {
        paintRef.current = {
          legend: true, seat: d.seat, stage: 0, startRow: d.row, role: 'mid',
          runTop: d.row, runBottom: d.row, canTop: false, canBottom: false,
          initial: [], painted: false,
        };
        const cell = e.active.rect.current.initial;
        const cellRem = ROW_H - 2 * INSET_Y;
        setLegendDrag({ sprite: cell ? (cell.height * SPRITE_REM) / cellRem : 52 });
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
        runTop, runBottom, canTop, canBottom,
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
        if (p.painted) {
          setLineBoundaries(cardIndex, p.seat, p.initial);
          p.painted = false;
        }
        setPreviewMove((cur) =>
          cur && cur.to === over.seat ? cur : { from: p.seat, to: over.seat },
        );
        return;
      }
      setPreviewMove(null);
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
    setLegendDrag(null);
  }, [cardIndex, setLineBoundaries]);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const p = paintRef.current;
      paintRef.current = null;
      setPreviewMove(null);
      setLegendDrag(null);
      const to = e.over?.data.current as CellDatum | undefined;
      if (!p) return;
      if (p.legend) {
        if (to && to.row === BOSS_ROW && card.legend) {
          setLegend(cardIndex, { ...card.legend, seat: to.seat });
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
    [card, cardIndex, moveSeat, setLegend, setLineBoundaries],
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
      ? deriveRows(renderLines, legendDrag ? null : card.legend)
      : rows;
  const legendPokemon = card.legend ? getPokemonById(card.legend.pokemonId) : undefined;

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
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <div
        className="relative overflow-hidden rounded-2xl shadow-elevated"
        style={{ ...vars, background: shades.base, padding: `${PAD_Y}rem ${PAD_X}rem` }}
      >
        <SignatureSlot cardIndex={cardIndex} view={view} />
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
                    legendDrag !== null && row === BOSS_ROW && card.legend?.seat === cell.seat;
                  const datum: CellDatum = {
                    row,
                    seat: cell.seat,
                    stage: line ? stageAt(line, row) : 0,
                    isLegend: cell.isLegend,
                    filled: cell.pokemonId !== null || legendSource,
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
                      lifted={previewMove !== null && cell.seat === previewMove.to && cell.pokemonId !== null && !cell.isLegend}
                      ringWhenOver={legendDrag !== null}
                      onRemove={topId !== null ? () => removeLineWith(cardIndex, topId) : undefined}
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
        <span>Drag a pokemon across rows to shift when it evolves</span>
        <ArrowLeftRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" aria-hidden />
        <span>Drag a column to reorder</span>
        <LaurelIcon className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem]" />
        <span>
          {card.legend
            ? 'Drag the Endgame Boss legendary to change which pokemon it replaces'
            : 'Tap a pokemon in the Endgame Boss row to swap in a legendary'}
        </span>
      </div>
      {/* Portalled out of the card's `zoom` so its pixel size is the one
          measured from the cell, not that size zoomed a second time. */}
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {legendDrag && legendPokemon ? (
            <div className="flex h-full w-full items-center justify-center">
              <img
                src={legendPokemon.sprite}
                alt=""
                className="max-w-none drop-shadow-[0_4px_8px_rgba(0,0,0,0.35)]"
                style={{
                  width: legendDrag.sprite,
                  height: legendDrag.sprite,
                  imageRendering: 'pixelated',
                }}
              />
            </div>
          ) : null}
        </DragOverlay>,
        document.body,
      )}
    </DndContext>
  );
}

export const CARD_ROWS_HEIGHT_REM =
  PAD_Y * 2 + BAND_H + ROW_COUNT * ROW_H + Object.keys(BAND_BEFORE).length * BAND_H;
