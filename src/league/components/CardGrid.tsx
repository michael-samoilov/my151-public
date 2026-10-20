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
import { getPokemonById } from '@/league/data/catalog';
import { getLocale, localeUppercase, pokemonLabel, raw, spriteAlt, t as translate, useNamesVersion, useT, type NoArgKey } from '@/i18n';
import { useDndAccessibility } from '@/lib/dndAccessibility';
import { splitTemplate, type TemplatePart } from '@/lib/richTemplate';
import { RedXIcon } from '@/components/browser/EvoLineCard';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { PokemonName } from '@/components/shared/PokemonName';
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
import { keepLastWord } from '../keepLastWord';
import { moveName, useMoveNames } from '../moveNames';
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
import { powerupFormName } from '../powerupFormName';
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

const ROW_H = 3.375;
const BAND_H = 1.25;
const PAD_X = 0.5;
const PAD_Y = 0.6875;
const INSET_Y = 0.375;
const INSET_X = 0.1875;

const LABEL_FACE = 'font-extrabold tracking-[0.08em] leading-[1.4]';
const CARD_LABEL_CLASS = `text-[0.53125rem] ${LABEL_FACE}`;

const CELL_LIFT_REM = 0.25;

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

function slotX(colFrom: number, colTo: number) {
  const col = `((100% - ${2 * PAD_X}rem) / 7)`;
  return {
    left: `calc(${PAD_X}rem + ${colFrom - 1} * ${col} + ${INSET_X}rem)`,
    width: `calc(${colTo - colFrom + 1} * ${col} - ${2 * INSET_X}rem)`,
  };
}

const NOTE_MIN_SCALE = 0.7;

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
  pokemonId: number | null;
}

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
  reordered: boolean;
  pickedUp: boolean;
}

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
  rem: number;
  rendering: React.CSSProperties['imageRendering'];
} | null {
  const target = activatorEvent.target;
  const cell = target instanceof Element ? target.closest('[data-testid^="card-cell-"]') : null;
  if (!cell) return null;
  const box = cell.getBoundingClientRect();
  const style = getComputedStyle(cell);
  const zoom = box.height / (parseFloat(style.height) || box.height);
  return {
    width: box.width,
    height: box.height,
    radius: parseFloat(style.borderTopLeftRadius) * zoom,
    rem: box.height / (ROW_H - 2 * INSET_Y),
    rendering: style.getPropertyValue(SPRITE_RENDERING_VAR).trim() as React.CSSProperties['imageRendering'] || undefined,
  };
}

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

const OVERLAY_MEASURING = {
  dragOverlay: { measure: (element: HTMLElement) => getClientRect(element, { ignoreTransform: true }) },
};

const TRUE_HOVER =
  typeof window !== 'undefined' && 'matchMedia' in window
    ? window.matchMedia('(hover: hover) and (pointer: fine)')
    : null;

function pointerMayColumnHover(e: React.PointerEvent): boolean {
  if (e.pointerType === 'touch') return false;
  if (!TRUE_HOVER?.matches) return false;
  return true;
}

function stageTint(pokemonId: number): string {
  const type = getPokemonById(pokemonId)?.types[0];
  const colour = (type && TYPE_COLORS[type as keyof typeof TYPE_COLORS]) || '#888888';
  return `${colour}2e`;
}

function formSprite(form: PowerupForm): string {
  return pokemonSpriteUrl(form.id);
}

function PokemonCell({ cardIndex, datum, pokemonId, form, powerupKind, onPowerup, held, ringWhenOver, onRemove, removeLabel, onReset, tint, columnHovered }: {
  cardIndex: number;
  datum: CellDatum;
  columnHovered?: boolean;
  pokemonId: number | null;
  form: PowerupForm | null;
  powerupKind: PowerupKind | null;
  onPowerup?: (kind: PowerupKind) => void;
  held: boolean;
  ringWhenOver: boolean;
  onRemove?: () => void;
  removeLabel?: string;
  onReset?: () => void;
  tint?: string;
}) {
  const t = useT();
  useNamesVersion();
  const id = `cell-${datum.row}-${datum.seat}`;
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id,
    data: datum as unknown as Record<string, unknown>,
    disabled: !datum.filled,
    attributes: { roleDescription: t('dnd.roleDescription') },
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
      openLeagueBrowser(cardIndex, 'legend', datum.seat);
    } else if (pokemonId !== null) {
      openLeagueBrowser(cardIndex, 'replace', datum.seat, pokemonId);
    }
  };

  const ringed = isOver && ringWhenOver && datum.row === BOSS_ROW && datum.filled;

  return (
    <div
      ref={setDropRef}
      data-seat={datum.seat}
      onClick={(e) => { if (e.target === e.currentTarget) onTap(); }}
      className="relative flex h-full cursor-pointer items-center justify-center"
    >
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
          datum.filled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer',
          ringed && 'ring-2 ring-[var(--lg-cell)]',
        )}
        style={{
          width: `calc(100% - ${2 * INSET_X}rem)`,
          height: `${ROW_H - 2 * INSET_Y}rem`,
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
            alt={form ? powerupFormName(form) : spriteAlt(pokemon.name, pokemon.id)}
            className="pointer-events-none max-w-none"
            style={{ width: `${SPRITE_REM}rem`, height: `${SPRITE_REM}rem`, imageRendering: SPRITE_RENDERING }}
          />
        ) : (
          <EmptySlotBall />
        )}
      </button>
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

const SYMBOL_INK: Record<PowerupSymbol, number> = { mega: 1, dynamax: 0.961, 'primal-kyogre': 1, 'primal-groudon': 1 };

const PIXEL_ART: ReadonlySet<PowerupSymbol> = new Set(['primal-kyogre', 'primal-groudon']);

const SYMBOL_EXTENT = 0.8;

function symbolScale(symbol: PowerupSymbol): string {
  return `${((SYMBOL_EXTENT / SYMBOL_INK[symbol]) * 100).toFixed(1)}%`;
}

const DISC_REM = 1;

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

function markBox(side: 'left' | 'right', inset: number): React.CSSProperties {
  const pad = `${MARK_PAD_REM}rem`;
  const edge = `${MARK_EDGE_REM}rem`;
  const inner = side === 'right' ? 'paddingLeft' : 'paddingRight';
  const outer = side === 'right' ? 'paddingRight' : 'paddingLeft';
  return {
    [side]: 0,
    top: `${inset - MARK_PAD_REM}rem`,
    width: `${MARK_REM + MARK_PAD_REM + MARK_EDGE_REM}rem`,
    height: `${MARK_BOX_REM + MARK_EDGE_REM}rem`,
    paddingTop: `${MARK_PAD_REM + MARK_EDGE_REM}rem`,
    paddingBottom: pad,
    [inner]: pad,
    [outer]: edge,
  };
}

const HIT_UP_REM = 0.5;
const HIT_DOWN_REM = 0.125;

const SLACK = `(100% - ${2 * DISC_REM}rem)`;

const HIT_INSET = `calc(${SLACK} / 8)`;
const HIT_WIDTH = `calc(${DISC_REM}rem + ${SLACK} / 4)`;
const HIT_HEIGHT = `${DISC_REM + HIT_UP_REM + HIT_DOWN_REM}rem`;

function PowerupButton({ kind, symbol, active, onPress, side }: {
  kind: PowerupKind;
  symbol: PowerupSymbol;
  active: boolean;
  onPress: () => void;
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

function SlotHalf({
  testId, half, heading, fit, place, pokemon, onPick, onRemove,
}: {
  testId: string;
  half: 'ace' | 'partner';
  heading: Heading;
  fit: HalfFit;
  place: { left: number; top: number } | { right: number; top: number };
  pokemon: ReturnType<typeof getPokemonById>;
  onPick: () => void;
  onRemove: () => void;
}) {
  useNamesVersion();
  const mirrored = half === 'partner';
  const nameLabel = pokemon ? pokemonLabel(pokemon.id, pokemon.name) : null;
  const formMarked = Boolean(nameLabel?.mark);
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
            alt={spriteAlt(pokemon.name, pokemon.id)}
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
  const text = nameLabel?.name ?? null;
  const clipped = fit.max > 0;
  const name = text !== null && (
    <span
      data-slot-name={half}
      className={cn('relative block w-max shrink-0 whitespace-nowrap', CAPTION_NAME_CLASS)}
      style={{
        color: 'var(--color-foreground, #0a0a0a)',
        fontSize: fit.scale < 1 ? `max(${CAPTION_MIN_REM}rem, var(--cap-size) * ${fit.scale})` : undefined,
        lineHeight: `calc(var(--cap-size) * ${CAPTION_LEADING})`,
        letterSpacing: fit.tight ? 0 : undefined,
        maxWidth: clipped ? `${fit.max}px` : undefined,
        overflow: clipped && !formMarked ? 'hidden' : undefined,
        textOverflow: clipped && !formMarked ? 'ellipsis' : undefined,
      }}
    >
      {formMarked && nameLabel ? <PokemonName label={nameLabel} truncate={clipped} /> : text}
    </span>
  );
  const probe = text !== null && (
    <span
      data-name-probe={half}
      aria-hidden="true"
      className={cn('pointer-events-none invisible absolute left-0 top-0 w-max whitespace-nowrap', CAPTION_NAME_CLASS)}
    >
      {formMarked && nameLabel ? <PokemonName label={nameLabel} truncate={false} /> : text}
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
      aria-label={nameLabel ? heading.filled(nameLabel.full) : heading.choose}
      className={cn(
        'absolute z-[6] flex items-center',
        mirrored ? 'flex-row' : 'flex-col',
        lab ? 'cursor-grab touch-none rounded outline-dashed outline-1 outline-offset-2' : 'cursor-pointer',
      )}
      style={{
        ...('left' in place ? { left: `${place.left}px` } : { right: `${place.right}px` }),
        top: `${place.top}px`,
        gap: mirrored ? `${CAPTION_GAP_X_REM}rem` : `${CAPTION_GAP_Y_REM}rem`,
        transform: `translate(${'left' in place ? '-50%' : '0px'}, 0px) translate(${offset.x}px, ${offset.y}px)`,
        outlineColor: lab ? 'rgba(37,99,235,0.5)' : undefined,
      }}
    >
      {mirrored ? <>{caption}{art}</> : <>{art}{caption}</>}
      {probe}
    </button>
  );
}

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

interface Heading {
  readonly lines: readonly string[];
  readonly choose: string;
  readonly filled: (name: string) => string;
  readonly remove: string;
}

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

const PANE_GRID: CardGridRem = { row: ROW_H, insetX: INSET_X, insetY: INSET_Y, padX: PAD_X, sprite: SPRITE_REM };

interface HalfFit {
  scale: number;
  tight: boolean;
  max: number;
}
interface CaptionFit {
  ace: HalfFit;
  partner: HalfFit;
  seam: SeamEnds | null;
  head: HeadFace | null;
}
const WHOLE: HalfFit = { scale: 1, tight: false, max: 0 };
const UNFITTED: CaptionFit = { ace: WHOLE, partner: WHOLE, seam: null, head: null };

interface HalfRead {
  art: Box;
  name: Box | null;
  natural: number;
  track: number;
  cap: number;
  head: { lines: Omit<HeadLine, 'room'>[]; cap: number };
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
    const range = document.createRange();
    const headLines = [...headEl.children].map((line) => {
      range.selectNodeContents(line);
      const letters = [...(line.textContent ?? '')].length;
      return { width: range.getBoundingClientRect().width / zoom, letters };
    });
    return {
      art: rel(root.querySelector('[data-slot-art]')!.getBoundingClientRect()),
      name: nameEl ? rel(nameEl.getBoundingClientRect()) : null,
      natural: probe ? probe.getBoundingClientRect().width / zoom : 0,
      track: probe ? [...(probe.textContent ?? '')].length * (parseFloat(getComputedStyle(probe).letterSpacing) || 0) : 0,
      cap: probe ? parseFloat(getComputedStyle(probe).fontSize) : 0,
      head: { lines: headLines, cap: parseFloat(headStyle.fontSize) },
    };
  };
  return { w: pane.offsetWidth, h: pane.offsetHeight, ace: read('ace'), partner: read('partner') };
}

function fitName(natural: number, track: number, room: number, cap: number, floor: number): HalfFit {
  if (natural <= room || cap <= 0) return WHOLE;
  const scale = Math.max(floor / cap, Math.floor((room / natural) * 200) / 200);
  const drawn = natural * scale;
  if (drawn <= room + 1) return { scale, tight: false, max: 0 };
  const tight = drawn - track * scale;
  return { scale, tight: true, max: tight > room + 1 ? Math.floor(Math.max(0, room)) : 0 };
}

function solveFit(pane: HTMLElement, remPx: number): CaptionFit {
  const previousSize = pane.style.getPropertyValue('--cap-size');
  const previousTrack = pane.style.getPropertyValue('--cap-track');
  try {
    pane.style.setProperty('--cap-size', paneFace(null).size);
    pane.style.setProperty('--cap-track', '0px');
    const natural = readPane(pane);
    const pad = SHOWCASE_PAD_REM * remPx;
    const floor = CAPTION_MIN_REM * remPx;
    const aceCentre = natural.ace.art.x + natural.ace.art.w / 2;
    const aceRoom = 2 * (Math.min(aceCentre, natural.w - aceCentre) - pad);
    const partnerRoom = natural.partner.art.x - CAPTION_GAP_X_REM * remPx - pad;
    const headings = (m: ReturnType<typeof readPane>) => fitHeadings([
      ...m.ace.head.lines.map((line) => ({ ...line, room: aceRoom })),
      ...m.partner.head.lines.map((line) => ({ ...line, room: partnerRoom })),
    ], m.ace.head.cap);
    const head = headings(natural);
    pane.style.setProperty('--cap-size', paneFace(head).size);
    const fitted = readPane(pane);
    return {
      ace: fitName(fitted.ace.natural, fitted.ace.track, aceRoom, fitted.ace.cap, floor),
      partner: fitted.partner.name
        ? fitName(fitted.partner.natural, fitted.partner.track, partnerRoom, fitted.partner.cap, floor)
        : WHOLE,
      seam: seamBetween(natural.w, natural.h, natural.ace.art, natural.partner.art, remPx),
      head: { ...head, track: headings(fitted).track },
    };
  } finally {
    pane.style.setProperty('--cap-size', previousSize);
    pane.style.setProperty('--cap-track', previousTrack);
  }
}

const sameHalf = (a: HalfFit, b: HalfFit) =>
  a.tight === b.tight && Math.abs(a.scale - b.scale) < 0.004 && Math.abs(a.max - b.max) < 1;
const sameSeam = (a: SeamEnds | null, b: SeamEnds | null) =>
  a === b || (!!a && !!b && (['x1', 'y1', 'x2', 'y2'] as const).every((k) => Math.abs(a[k] - b[k]) < 1e-3));
const sameHead = (a: HeadFace | null, b: HeadFace | null) =>
  a === b || (!!a && !!b && (a.size === b.size || Math.abs(a.size - b.size) < 0.01) && Math.abs(a.track - b.track) < 0.01);

function useCaptionFit(ref: React.RefObject<HTMLDivElement | null>, content: string): CaptionFit {
  const [fit, setFit] = useState(UNFITTED);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const compute = () => {
      const next = solveFit(el, getAppliedRootFontSizePx());
      setFit((previous) => sameHalf(next.ace, previous.ace) && sameHalf(next.partner, previous.partner)
        && sameSeam(next.seam, previous.seam) && sameHead(next.head, previous.head) ? previous : next);
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    for (const art of el.querySelectorAll('[data-slot-art]')) ro.observe(art);
    document.fonts.addEventListener('loadingdone', compute);
    return () => {
      ro.disconnect();
      document.fonts.removeEventListener('loadingdone', compute);
    };
  }, [ref, content]);
  return fit;
}

const HEAD_CLASS = 'text-[length:var(--cap-size)] font-extrabold tracking-[var(--cap-track)] leading-[1.4]';
const NAME_CLASS = 'text-[0.53125rem] font-extrabold tracking-[0.02em] leading-[1.4] uppercase';
const CAPTION_NAME_CLASS = 'text-[length:var(--cap-size)] font-extrabold tracking-[0.02em] leading-[1.4] uppercase';

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
  const namesVersion = useNamesVersion();
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
  const labPosition = useSlotLab((st) => st.enabled
    ? `${st.ace.dx},${st.ace.dy},${st.partner.dx},${st.partner.dy}` : '');
  const remPx = getAppliedRootFontSizePx();
  const squares = showcaseSquares(box[0], remPx, PANE_GRID);
  const unitPx = labSprite > 0 ? labSprite : squares.partner.size;
  const partnerPlace = {
    right: box[0] - (squares.partner.cx + squares.partner.size / 2),
    top: squares.partner.cy - squares.partner.size / 2,
  };
  const content = JSON.stringify([
    ace?.id, partner?.id, aceHead.lines, partnerHead.lines, getLocale(), namesVersion, remPx, box, labPosition,
  ]);
  const fit = useCaptionFit(slotRef, content);
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

const MARK_ROWS = 1.5;
const MARK_PAD = '0.28125rem';
const MARK_GAP = '0.28125rem';
const MARK_TRAIL = '0.0625rem';
const MARK_GLYPH = '72%';
const MARK_COL = 'min(2.75rem, 26cqw)';
const MARK_LABEL_ROOM = `(${MARK_COL} + ${MARK_PAD} + ${MARK_GAP} - 0.25rem)`;
const MARK_LABEL_TYPE = 'text-[length:var(--mark-label)] font-extrabold tracking-[var(--mark-track)] leading-[1.4]';
const MARK_LABEL_CLASS = `shrink-0 whitespace-nowrap ${MARK_LABEL_TYPE}`;

interface MarkWord {
  natural: number;
  letters: number;
  tracked: boolean;
}
const EN_MARK_WORD: MarkWord = { natural: 3.52, letters: 5, tracked: true };
const markWordCache = new Map<string, MarkWord>();

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
  const words = [translate('league.tm.mark'), translate('league.badge.mark')].flatMap((w) => localeUppercase(w).split('\n'));
  const measured = words.map((word) => ({ natural: ctx.measureText(word).width / 100, letters: [...word].length, tracked }));
  const width = (w: MarkWord) => w.natural + (w.tracked ? 0.08 * w.letters : 0);
  const widest = measured.reduce((a, b) => (width(b) > width(a) ? b : a));
  markWordCache.set(key, widest);
  return widest;
}

const round = (n: number) => String(Number(n.toFixed(3)));

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

function TmSlot({ cardIndex, view }: { cardIndex: number; view: CardView }) {
  const t = useT();
  const markStyle = useMarkBoxStyle();
  const setMovePickerOpen = useLeagueUi((s) => s.setMovePickerOpen);
  const setTm = useLeagueStore((s) => s.setTm);
  const move = view.card.tmMoveId !== null ? getMoveById(view.card.tmMoveId) : undefined;
  useMoveNames();
  const name = move ? moveName(move) : '';
  const nameRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = nameRef.current;
    if (!el) return;
    el.style.fontSize = '';
    if (!move) return;
    const fit = () => {
      el.style.fontSize = '';
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      const zoom = box.width / parseFloat(style.width);
      const range = document.createRange();
      range.selectNodeContents(el);
      const cap = parseFloat(style.fontSize);
      const room = box.width - parseFloat(style.paddingRight) * zoom;
      const widest = Math.max(0, ...[...range.getClientRects()].map((r) => r.width));
      let { scale } = fitName(widest, 0, room, cap, 0);
      if (scale < 1) el.style.fontSize = `${cap * scale}px`;
      const lines = () => new Set([...range.getClientRects()].map((r) => Math.round(r.top))).size;
      for (let round = 0; round < 8 && lines() > 2; round++) {
        scale *= 0.92;
        el.style.fontSize = `${cap * scale}px`;
      }
    };
    const observer = new ResizeObserver(fit);
    observer.observe(el.parentElement!);
    document.fonts.addEventListener('loadingdone', fit);
    fit();
    return () => {
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', fit);
    };
  }, [move, name]);
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
        <span className="w-full" style={{ aspectRatio: '1', maxWidth: MARK_GLYPH }}>
          <TmDisc colour={move ? TYPE_COLORS[move.type] : 'var(--lg-dash)'} size="100%" />
        </span>
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
          <span
            ref={nameRef}
            data-tm-name=""
            className={cn(
              'min-w-0 w-full max-w-full text-left',
              NAME_CLASS,
              /\s/.test(name.trim()) ? 'whitespace-normal break-normal' : 'whitespace-nowrap',
            )}
            style={{ paddingRight: MARK_TRAIL, color: cardShades(move.type).band, lineHeight: '0.74375rem' }}
          >
            {keepLastWord(name)}
          </span>
        </span>
      ) : (
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
  if (!/[\s-]/.test(text)) suffix.style.whiteSpace = 'nowrap';
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
      <span
        className="flex shrink-0 flex-col items-center justify-center"
        style={{ width: MARK_COL }}
      >
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
        className={cn(
          'min-w-0 flex-1 overflow-hidden pr-[0.25rem] text-left',
          name ? NAME_CLASS : 'text-[0.5rem] font-extrabold leading-[1.2]',
        )}
        style={{ maxHeight: `${3 * 0.53125 * 1.4}rem`, color: 'var(--lg-band)' }}
      >
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
  const moveLegend = useLeagueStore((s) => s.moveLegend);
  const removeLineAt = useLeagueStore((s) => s.removeLineAt);
  const cyclePowerupOnCard = useLeagueStore((s) => s.cyclePowerup);
  const { card, shades, rows } = view;
  const t = useT();
  const dndAccessibility = useDndAccessibility();

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
  // powerup rides its seat and a reorder hands it to another line. The
  // legendaries come with theirs, because a press swaps their sprite too.
  const warmable = [...new Set([...card.lines.flatMap((line) => line.branch), ...legendsOf(card).map((l) => l.pokemonId)]
    .flatMap((id) => {
      const sprite = getPokemonById(id)?.sprite;
      const forms = [...formsFor(id, 'mega'), ...formsFor(id, 'dynamax')];
      return [...(sprite ? [sprite] : []), ...forms.map(formSprite)];
    }))]
    .sort()
    .join('|');
  const warmedSprites = useRef<HTMLImageElement[]>([]);
  useEffect(() => {
    warmedSprites.current = warmImages(warmable.split('|').filter(Boolean));
    return () => { warmedSprites.current = []; };
  }, [warmable]);

  const paintRef = useRef<PaintDrag | null>(null);
  const [previewMove, setPreviewMove] = useState<{ from: number; to: number } | null>(null);
  const [legendDrag, setLegendDrag] = useState(false);
  const [stageDrag, setStageDrag] = useState<{ seat: number; stage: number } | null>(null);
  const travelRef = usePointerTravel();
  const pendingHeld = useRef<typeof held>(null);
  // What the pointer carries, and how big to draw it. Every size is measured
  // from the cell it was lifted from, in client pixels, because the card sits
  // under a CSS `zoom` and the overlay is portalled out of it — a rem in the
  // portal is the root's rem, not the card's.
  const [held, setHeld] = useState<{
    ids: number[];
    form?: PowerupForm | null;
    sprite: number;
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
      const pickedUp = travelRef.current <= (cell?.height ?? 0) / 2;
      const grabbed = card.lines[d.seat - 1];
      if (d.isLegend) {
        const legend = legendAt(card, d.seat);
        setHeld({
          ids: legend ? [legend.pokemonId] : [],
          form: formAt(powerupsAt(card, BOSS_ROW), BOSS_ROW, d.seat, legend?.pokemonId ?? null),
          sprite,
          face,
        });
      } else if (grabbed) {
        const column = { ids: grabbed.branch, sprite, face };
        if (pickedUp) {
          setHeld(column);
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
        p.reordered = true;
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
      if (p.pickedUp) {
        setPreviewMove((cur) =>
          cur && cur.from === p.seat && cur.to === p.seat ? cur : { from: p.seat, to: p.seat },
        );
      }
      if (p.reordered) return;
      let role = p.role;
      if (role === 'edge' && over.row !== p.startRow) {
        role = over.row < p.startRow
          ? (p.canTop ? 'top' : p.canBottom ? 'bottom' : 'mid')
          : (p.canBottom ? 'bottom' : p.canTop ? 'top' : 'mid');
        p.role = role;
      }
      if (role === 'mid') {
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
        if (to && to.row === BOSS_ROW) moveLegend(cardIndex, p.seat, to.seat);
        return;
      }
      if (to && to.seat !== p.seat) {
        if (p.painted) setLineBoundaries(cardIndex, p.seat, p.initial);
        moveSeat(cardIndex, p.seat, to.seat);
      }
    },
    [cardIndex, moveLegend, moveSeat, setLineBoundaries],
  );

  const vars = {
    '--lg-cell': shades.cell,
    '--lg-band': shades.band,
    '--lg-dash': shades.dash,
    '--lg-hint': shades.hint,
    '--lg-slot': '#ffffff',
    '--lg-hover': shades.hover,
  } as React.CSSProperties;

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

  const renderLines = previewMove
    ? reorderLines(card.lines, previewMove.from, previewMove.to)
    : card.lines;
  const previewSeat = useCallback(
    (seat: number) => (previewMove ? seatAfterMove(seat, previewMove.from, previewMove.to) ?? seat : seat),
    [previewMove],
  );
  // A lifted legendary takes its form along, so the line it uncovers shows none.
  const previewPowerups = useCallback(
    (row: number) => powerupsAt(card, row)
      .filter((p) => !(legendDrag && row === BOSS_ROW && legendAt(card, p.seat)))
      .map((p) => ({ ...p, seat: previewSeat(p.seat) })),
    [card, legendDrag, previewSeat],
  );
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
  const heldPokemon = held && legendDrag
    ? held.ids.map((id) => getPokemonById(id)).filter((p): p is NonNullable<typeof p> => !!p)
    : [];

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
      accessibility={dndAccessibility}
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
                  const form = formAt(previewPowerups(row), row, cell.seat, cell.pokemonId);
                  const custom =
                    topId !== null && line !== undefined
                    && effectiveBoundaries(line).join() !== defaultBoundaries(line.branch).join();
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
                      form={form}
                      powerupKind={form ? previewPowerups(row).find((p) => p.seat === cell.seat)?.kind ?? null : null}
                      onPowerup={
                        !inHand && isPowerupRow(row) && cell.pokemonId !== null
                          ? (kind) => cyclePowerupOnCard(cardIndex, row, cell.seat, kind, cell.pokemonId as number)
                          : undefined
                      }
                      held={previewMove !== null && cell.seat === previewMove.to && cell.pokemonId !== null}
                      ringWhenOver={legendDrag}
                      onRemove={
                        inHand
                          ? undefined
                          : cell.isLegend
                            ? () => setLegend(cardIndex, null, cell.seat)
                            : topId !== null
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
      <div
        data-fit-tail
        className="grid grid-cols-[0.75rem_1fr] gap-x-[0.375rem] gap-y-[3px] px-[0.375rem] pt-2 text-[0.625rem] leading-[1.35] text-muted-foreground"
      >
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
                    src={held.form ? formSprite(held.form) : p.sprite}
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

