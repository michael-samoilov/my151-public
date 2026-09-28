import { useCallback, useContext, useMemo, useRef, useState } from 'react';
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
import {
  createEffectiveCursorCollision,
  dragInputIsTouch,
  dragPointerRef,
  isTouchDrag,
} from '@/lib/dragCollision';
import { cn } from '@/lib/utils';
import { useDragSensors } from '@/lib/dragSensors';
import { BOSS_ROW, SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { deriveRow, leagueSlotIsEmpty, moveLeagueSlots } from '../model/engine';
import { cardShades } from '../theme';
import { fitStyle, useFitScale } from '../useFitScale';
import {
  fitHomeLayout,
  HOME_SPRITE_REM,
  homeHeightRem,
  homeMetrics,
  HomeMetricsContext,
  TIGHTEST,
} from '../homeLayout';
import { screenRule, spriteRendering, spriteScreen, SPRITE_RENDERING } from '../spriteScale';
import { getAppliedRootFontSizePx } from '@/lib/layoutFontSize';
import { useDevicePixelRatio } from '@/lib/usePixelPerfectSprite';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import {
  emptyCard,
  legendsOf,
  powerupsAt,
  useLeagueStore,
  type GymCard,
} from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars } from './glyphs';
import { LeagueRosterNudge } from './LeagueFunnelNudge';

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

// Row, band, and sprite sizes live in `../homeLayout`, which spends a short
// window's height on them.
const GREY = '#a3a3a3';
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

const rowCollision = createEffectiveCursorCollision(HIT_LIFT_PX);

/**
 * Reorder index from the thumb on touch (lift is hit-test only).
 *
 * Collision reads a point above the finger so the target stays visible, but
 * preview uses `moveLeagueSlots` and must follow the thumb — not the lifted
 * hit point — or labels jump before the finger crosses a row.
 */
function insertIndexFromThumb(): number | undefined {
  const y = dragPointerRef.current?.y;
  if (y === undefined) return undefined;

  let best: number | undefined;
  let bestD2 = Infinity;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const el = document.querySelector(`[data-testid="league-slot-${i}"]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    const cy = r.top + r.height / 2;
    const d2 = (cy - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

const SECTION_BEFORE: Record<number, string> = {
  0: 'GYM LEADERS',
  8: 'ELITE FOUR',
  12: 'CHAMPION',
  13: 'ENDGAME BOSS',
};

function SlotGlyph({ index, cell }: { index: number; cell: string }) {
  const kind = slotKind(index);
  if (kind === 'gym') return <GymBadges n={index + 1} />;
  if (kind === 'elite') return <Stars n={index - 7} size={9} />;
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
function SlotRowFace({ position, card, active }: { position: number; card: GymCard; active: boolean }) {
  const view = useLeagueStore((s) => s.view);
  const shades = card.type || active ? cardShades(card.type) : null;
  const cellColour = shades ? shades.cell : GREY;
  // The gym challenge reads each trainer at the row you meet them; the
  // rematch view reads every trainer at their last row instead.
  const row = view === 'rematch' ? BOSS_ROW : slotRow(position);
  const cells = deriveRow(card.lines, row, row === BOSS_ROW ? legendsOf(card) : []);
  const filled = card.lines.length > 0;
  const m = useContext(HomeMetricsContext);

  return (
    <div
      className="grid w-full items-center rounded-[0.3125rem] text-left"
      style={{
        gridTemplateColumns: `2.75rem 2rem repeat(${TEAM_COLS + 1}, minmax(0, 1fr))`,
        height: `${m.rowRem}rem`,
        background: shades ? shades.base : '#ffffff',
        boxShadow: 'inset 0 1px 0 #f0f0f1',
      }}
    >
        <span
          className="mx-[0.1875rem] flex items-center justify-center self-center rounded-[0.3125rem]"
          style={{ height: `${m.rowRem - 0.625}rem`, background: cellColour }}
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
            <span className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem] border-[1.4px] border-dashed border-border" />
          )}
        </span>
        {Array.from({ length: TEAM_COLS - cells.length }, (_, k) => (
          <span key={`sp-${k}`} />
        ))}
        {cells.map((cell) => {
          const p = cell.pokemonId !== null ? getPokemonById(cell.pokemonId) : undefined;
          const form = formAt(powerupsAt(card, row), row, cell.seat, cell.pokemonId);
          return (
            <span key={cell.seat} className="flex items-center justify-center">
              {p ? (
                <img
                  key={form ? `/sprites/pokemon/${form.id}.png` : p.sprite}
                  src={form ? `/sprites/pokemon/${form.id}.png` : p.sprite}
                  alt={form ? form.label : p.name}
                  className="max-w-none"
                  style={{
                    width: `${HOME_SPRITE_REM}rem`,
                    height: `${HOME_SPRITE_REM}rem`,
                    imageRendering: SPRITE_RENDERING,
                    // A trimmed row reserves less than the sprite, and the
                    // image hangs over its edges. A grid item paints after
                    // every row's background, so it lands above the rows and
                    // bands beside it with no z-index.
                    ...(m.trimRem > 0 ? { margin: `-${m.trimRem}rem` } : null),
                  }}
                />
              ) : filled ? (
                <EmptySlotBall size={18} />
              ) : null}
            </span>
          );
        })}
        <span
          aria-hidden
          data-testid={`league-action-${position}`}
          data-action={filled ? 'open' : 'add'}
          className={cn(
            'flex items-center justify-center justify-self-center rounded-md',
            filled
              ? 'text-muted-foreground'
              : 'h-[1.875rem] w-[1.875rem] border-[1.4px] border-dashed border-border text-[#a3a3a3]',
          )}
        >
        {filled ? <ChevronRight size={16} strokeWidth={2.4} /> : <Plus size={12} strokeWidth={2.4} />}
      </span>
    </div>
  );
}

/** The row as the league renders it: a drop target that drags and opens. */
function SlotRow({ position, card, held, canDrag }: {
  position: number;
  card: GymCard;
  /** This row is where the carried one would land, so it draws it in hand. */
  held: boolean;
  canDrag: boolean;
}) {
  const openCardPage = useLeagueUi((s) => s.openCardPage);
  const active = useLeagueUi((s) => s.openCard === position);
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: `slot-${position}`,
    data: { index: position },
    disabled: !canDrag,
  });
  const { setNodeRef: setDropRef } = useDroppable({ id: `slotdrop-${position}`, data: { index: position } });
  const dragProps = canDrag ? { ...listeners, ...attributes } : {};

  return (
    <div ref={setDropRef}>
      <button
        type="button"
        ref={setDragRef}
        {...dragProps}
        data-testid={`league-slot-${position}`}
        onClick={() => openCardPage(position)}
        className="block w-full cursor-pointer"
        style={{ touchAction: 'pan-y pinch-zoom' }}
      >
        {held ? (
          <div
            data-drag-held
            data-placement="on"
            className="origin-center overflow-hidden rounded-[0.3125rem] shadow-lg ring-1 ring-black/10"
            style={{ transform: `scale(${HELD_ROW_SCALE})` }}
          >
            <SlotRowFace position={position} card={card} active={active} />
          </div>
        ) : (
          <SlotRowFace position={position} card={card} active={active} />
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
  const isDesktop = useIsDesktop();
  const dpr = useDevicePixelRatio();
  const screen = spriteScreen(isDesktop, dpr);
  const rule = screenRule(screen);
  const rootPx = getAppliedRootFontSizePx();
  const fit = useFitScale(
    fitRef,
    0.55,
    rule.homeCeilingPx
      ? {
          baseWidthRem: 26,
          spriteRem: HOME_SPRITE_REM,
          targetSpritePx: rule.homeCeilingPx(dpr),
          shortestRem: rule.holdsCeiling ? homeHeightRem(TIGHTEST, rootPx) : undefined,
        }
      : undefined,
  );
  const metrics = homeMetrics(fitHomeLayout(fit.budgetRem, rootPx));
  const rendering = spriteRendering(screen, HOME_SPRITE_REM * rootPx * fit.scale, dpr);
  const [preview, setPreview] = useState<{ from: number; to: number } | null>(null);
  const cards = useLeagueStore((s) => s.cards);
  const blank = cards.every((c) => leagueSlotIsEmpty(c));

  const displayCards = useMemo(() => {
    if (!preview) return cards;
    return moveLeagueSlots(
      cards,
      preview.from,
      preview.to,
      leagueSlotIsEmpty,
      emptyCard,
    );
  }, [cards, preview]);

  const onDragStart = useCallback((e: DragStartEvent) => {
    dragInputIsTouch.current = isTouchDrag(e.activatorEvent);
    const position = (e.active.data.current as { index: number } | undefined)?.index;
    if (position === undefined) return;
    setPreview({ from: position, to: position });
  }, []);

  const onDragOver = useCallback((e: DragOverEvent) => {
    const from = (e.active.data.current as { index: number } | undefined)?.index;
    const to =
      insertIndexFromThumb()
      ?? (e.over?.data.current as { index: number } | undefined)?.index;
    if (from === undefined || to === undefined) return;
    setPreview((cur) => (cur && cur.to === to && cur.from === from ? cur : { from, to }));
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const from = (e.active.data.current as { index: number } | undefined)?.index;
      const to =
        insertIndexFromThumb()
        ?? (e.over?.data.current as { index: number } | undefined)?.index;
      dragInputIsTouch.current = false;
      setPreview(null);
      if (from === undefined || to === undefined || from === to) return;
      moveSlot(from, to);
    },
    [moveSlot],
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={rowCollision}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragCancel={() => {
        dragInputIsTouch.current = false;
        setPreview(null);
      }}
    >
      <HomeMetricsContext.Provider value={metrics}>
      <div ref={fitRef} style={fitStyle(fit, rendering)}>
        <div
          data-lg-league-root
          className="rounded-2xl bg-card shadow-elevated"
          style={{ padding: `${metrics.padRem}rem` }}
        >
          {displayCards.map((card, position) => (
            <div key={position}>
              {SECTION_BEFORE[position] && (
                <div
                  className="flex items-center rounded-[0.3125rem] px-2 text-white"
                  style={{
                    height: `${metrics.bandRem}rem`,
                    marginTop: position > 0 ? metrics.gapPx : 0,
                    background: BAND_RED,
                  }}
                >
                  <b className="text-[0.5625rem] font-extrabold tracking-[0.07em]">{SECTION_BEFORE[position]}</b>
                </div>
              )}
              <SlotRow
                position={position}
                card={card}
                held={preview !== null && position === preview.to}
                canDrag={!leagueSlotIsEmpty(cards[position])}
              />
            </div>
          ))}
        </div>
        <div
          data-fit-tail
          className="px-[0.375rem] text-[0.625rem] leading-[1.35] text-muted-foreground"
          style={{ paddingTop: `${metrics.hintPadRem}rem` }}
        >
          {metrics.hints === 1 ? (
            <div className="flex items-start gap-[0.3125rem]">
              <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
              <span className="min-w-0 truncate">
                {blank ? 'Drag a row to reorder · tap a row to add a trainer' : 'Drag a row to reorder · tap a row to open its card'}
              </span>
            </div>
          ) : metrics.hints === 2 ? (
            <>
              <div className="flex items-start gap-[0.3125rem]">
                <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
                <span className="min-w-0 truncate">Drag a row to reorder the league</span>
              </div>
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
            </>
          ) : null}
        </div>
      </div>
      {/* After the fitted block, not in its tail: the popup keeps its own
          size, and the fit reserves its height. */}
      <LeagueRosterNudge fit={fit} />
      </HomeMetricsContext.Provider>
    </DndContext>
  );
}
