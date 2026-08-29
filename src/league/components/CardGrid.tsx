import { useCallback, useState } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { getPokemonById } from '@/hooks/usePokemonData';
import { pokemonLabel } from '@/i18n';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import type { TypeName } from '@/types/pokemon';
import { cn } from '@/lib/utils';
import { BOSS_ROW, CHAMPION_ROW, ELITE_ROW, ROW_COUNT, TEAM_SIZES } from '../model/constants';
import { stageAt } from '../model/engine';
import { getMoveById } from '../moves';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { openLeagueBrowser } from '../store/browserBridge';
import type { CardView } from '../useCardView';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars, TmDisc } from './glyphs';

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
      {note && <span className="overflow-hidden whitespace-nowrap text-[0.53125rem] opacity-85">{note}</span>}
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

/** A drag in flight: the grabbed cell's column, and the column under it. */
interface DragPreview {
  seat: number;
  over: CellDatum | null;
  legend: boolean;
}

/**
 * Live reorder preview, in grid columns (seat 1 is the rightmost column, so
 * screen position moves opposite to seat number). The grabbed column snaps to
 * the hovered seat; the columns between step one seat toward the hole. The
 * legendary never shifts — it owns a seat, and columns move under it.
 */
function colShift(preview: DragPreview | null, datum: CellDatum): number {
  if (!preview || preview.legend || datum.isLegend) return 0;
  const over = preview.over;
  if (!over || over.isLegend || over.seat === preview.seat) return 0;
  const s = preview.seat;
  const o = over.seat;
  if (datum.seat === s) return s - o;
  if (o < s && datum.seat >= o && datum.seat < s) return -1;
  if (o > s && datum.seat > s && datum.seat <= o) return 1;
  return 0;
}

function PokemonCell({ cardIndex, datum, pokemonId, preview, onRemove }: {
  cardIndex: number;
  datum: CellDatum;
  pokemonId: number | null;
  preview: DragPreview | null;
  /** Set on the column's topmost pokemon: remove this evo line. */
  onRemove?: () => void;
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

  // The whole grabbed column lifts as one entity; between-columns slide over.
  const dx = colShift(preview, datum);
  const lifted =
    preview !== null &&
    ((!preview.legend && !datum.isLegend && datum.seat === preview.seat) ||
      (preview.legend && datum.isLegend));
  // A ring marks a drop target only where the drop is not a column reorder:
  // a boss-row cell during a legendary drag, or a row within the same column
  // (an evolution-boundary move). Reorders are previewed by the slide itself.
  const ringed =
    isOver &&
    preview !== null &&
    (preview.legend ? datum.row === BOSS_ROW : datum.seat === preview.seat);

  return (
    <div
      ref={setDropRef}
      className="relative flex h-full items-center justify-center"
      style={{
        transform: dx !== 0 ? `translateX(${dx * 100}%)` : undefined,
        transition: preview ? 'transform 150ms ease' : undefined,
        zIndex: lifted ? 10 : undefined,
      }}
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
            style={{ width: '3.25rem', height: '3.25rem', imageRendering: 'pixelated' }}
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
      <span className="flex shrink-0 flex-col items-center gap-[1px]">
        {/* Empty state matches the badge hexagon's stroke, not the cell fill. */}
        <TmDisc colour={move ? 'var(--lg-cell)' : 'var(--lg-dash)'} />
        <span className="text-[0.5rem] font-extrabold tracking-[0.06em]" style={{ color: 'var(--lg-hint)' }}>
          TM
        </span>
      </span>
      <span
        className="min-w-0 text-left text-[0.6875rem] leading-[1.15]"
        style={{ color: move ? undefined : 'var(--lg-hint)' }}
      >
        {move ? move.name : 'Pick a move'}
      </span>
    </button>
  );
}

function BadgeSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const setBadgeName = useLeagueStore((s) => s.setBadgeName);
  const name = view.card.badgeName;
  const pos = {
    ...slotX(1, 2),
    top: `${rowTop(6) + INSET_Y}rem`,
    height: `${2 * ROW_H - 2 * INSET_Y}rem`,
  };
  return (
    <div
      className={cn('absolute z-[5] flex flex-col items-center justify-center gap-[0.375rem] rounded-lg', !name && 'border border-dashed')}
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
      <input
        value={name}
        onChange={(e) => setBadgeName(cardIndex, e.target.value)}
        placeholder="Badge Name"
        // 16px once the card's fit zoom is divided back out, so iOS Safari
        // does not auto-zoom the page on focus (the heuristic reads the
        // input's font-size, not the placeholder's — the placeholder renders
        // smaller so "Badge Name" fits the slot). Left-aligned while empty so
        // the caret sits at the start of the placeholder, centred once typed.
        className="w-full bg-transparent px-[2px] text-center leading-tight outline-none [&:placeholder-shown]:text-left placeholder:text-[0.8125rem] placeholder:text-[var(--lg-hint)]"
        style={{ fontSize: 'calc(1rem / var(--lg-fit, 1))' }}
        aria-label="Badge name"
      />
      {name && (
        <span className="-mt-[0.3125rem] leading-tight" style={{ fontSize: 'calc(1rem / var(--lg-fit, 1))' }}>
          Badge
        </span>
      )}
    </div>
  );
}

export function CardGrid({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const moveSeat = useLeagueStore((s) => s.moveSeat);
  const shiftBoundary = useLeagueStore((s) => s.shiftBoundary);
  const setLegend = useLeagueStore((s) => s.setLegend);
  const removeLineWith = useLeagueStore((s) => s.removeLineWith);
  const { card, shades, rows } = view;

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const [preview, setPreview] = useState<DragPreview | null>(null);
  const onDragStart = useCallback((e: DragStartEvent) => {
    const d = e.active.data.current as CellDatum | undefined;
    if (d) setPreview({ seat: d.seat, over: null, legend: d.isLegend });
  }, []);
  const onDragOver = useCallback((e: DragOverEvent) => {
    const over = (e.over?.data.current as CellDatum | undefined) ?? null;
    setPreview((p) => (p ? { ...p, over } : p));
  }, []);
  const onDragCancel = useCallback(() => setPreview(null), []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      setPreview(null);
      const from = e.active.data.current as CellDatum | undefined;
      const to = e.over?.data.current as CellDatum | undefined;
      if (!from || !to) return;
      if (from.isLegend) {
        if (to.row === BOSS_ROW && card.legend) {
          setLegend(cardIndex, { ...card.legend, seat: to.seat });
        }
        return;
      }
      if (to.seat !== from.seat) {
        moveSeat(cardIndex, from.seat, to.seat);
        return;
      }
      if (to.row !== from.row) {
        const line = card.lines[from.seat - 1];
        if (!line) return;
        if (to.row < from.row) {
          // Dragging up: this stage appears earlier.
          shiftBoundary(cardIndex, from.seat, from.stage, to.row);
        } else if (from.stage + 1 < line.branch.length) {
          // Dragging down: this stage persists, so the next one waits.
          shiftBoundary(cardIndex, from.seat, from.stage + 1, to.row + 1);
        }
      }
    },
    [card, cardIndex, moveSeat, setLegend, shiftBoundary],
  );

  const vars = {
    '--lg-cell': shades.cell,
    '--lg-band': shades.band,
    '--lg-dash': shades.dash,
    '--lg-hint': shades.hint,
    '--lg-slot': '#ffffff',
  } as React.CSSProperties;

  // The column's topmost pokemon carries the remove control for its line.
  // The legendary overlay is skipped: it is not the line, it covers it.
  const topRowBySeat = new Map<number, number>();
  rows.forEach((cells, i) => {
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
        {rows.map((cells, i) => {
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
                  const line = card.lines[cell.seat - 1];
                  const datum: CellDatum = {
                    row,
                    seat: cell.seat,
                    stage: line ? stageAt(line, row) : 0,
                    isLegend: cell.isLegend,
                    filled: cell.pokemonId !== null,
                  };
                  const topId = topRowBySeat.get(cell.seat) === row ? cell.pokemonId : null;
                  return (
                    <PokemonCell
                      key={`${row}-${cell.seat}`}
                      cardIndex={cardIndex}
                      datum={datum}
                      pokemonId={cell.pokemonId}
                      preview={preview}
                      onRemove={topId !== null ? () => removeLineWith(cardIndex, topId) : undefined}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex flex-col gap-[3px] px-[0.375rem] pt-2 text-[0.625rem] leading-[1.35] text-muted-foreground">
        <span>{'↕︎'} Drag a pokemon across rows to shift when it evolves</span>
        <span>↔ Drag a column to reorder</span>
        <span>
          {card.legend
            ? '↔ Drag the Endgame Boss legendary to change which pokemon it replaces'
            : 'Tap a pokemon in the Endgame Boss row to swap in a legendary'}
        </span>
      </div>
    </DndContext>
  );
}

export const CARD_ROWS_HEIGHT_REM =
  PAD_Y * 2 + BAND_H + ROW_COUNT * ROW_H + Object.keys(BAND_BEFORE).length * BAND_H;
