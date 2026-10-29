import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  useDraggable,
  useDroppable,
  closestCenter,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { ArrowUpDown, ChevronRight, Plus } from 'lucide-react';
import { getPokemonById } from '@/league/data/catalog';
import { formAt } from '../model/powerups';
import { powerupFormName } from '../powerupFormName';
import { typeIconPath } from '@/data/type-ids';
import { starPath } from '@/lib/sectionOutlines';
import {
  dragInputIsTouch,
  dragPointerRef,
  isTouchDrag,
} from '@/lib/dragCollision';
import { cn } from '@/lib/utils';
import { useDragSensors } from '@/lib/dragSensors';
import { BOSS_ROW, SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { slotLabel } from '../slotLabel';
import { localeUppercase, spriteAlt, typeLabel, useNamesVersion, useT, type NoArgKey } from '@/i18n';
import { useDndAccessibility } from '@/lib/dndAccessibility';
import { deriveRow, leagueSlotIsEmpty, moveLeagueSlots } from '../model/engine';
import { NO_TYPE_STAR_RADIUS, cardShades } from '../theme';
import { fitStyle, useFitScale } from '../useFitScale';
import {
  fitHomeLayout,
  HOME_SPRITE_REM,
  homeHeightRem,
  homeMetrics,
  HomeMetricsContext,
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
import { pokemonSpriteUrl } from '@/lib/spriteUrl';

const GREY = '#a3a3a3';
const BAND_RED = '#dc2626';
const TEAM_COLS = 6;

function rowRects(): DOMRect[] {
  return Array.from({ length: SLOT_COUNT }, (_, i) =>
    document.querySelector(`[data-testid="league-slot-${i}"]`)?.parentElement?.getBoundingClientRect(),
  ).filter((r): r is DOMRect => r !== undefined);
}

function insertIndexFromPointer(): number | undefined {
  const y = dragPointerRef.current?.y;
  if (y === undefined) return undefined;
  const rects = rowRects();
  if (rects.length !== SLOT_COUNT) return undefined;
  let best: number | undefined;
  let bestD2 = Infinity;
  for (const [i, r] of rects.entries()) {
    const cy = r.top + r.height / 2;
    const d2 = (cy - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

const rowCollision: CollisionDetection = (args) => {
  dragPointerRef.current = args.pointerCoordinates;
  const index = insertIndexFromPointer();
  return index === undefined ? closestCenter(args) : [{ id: `slotdrop-${index}`, data: { value: 0 } }];
};

function canScrollRows(): boolean {
  const rects = rowRects();
  if (rects.length !== SLOT_COUNT) return true;
  const viewport = window.visualViewport;
  let top = viewport?.offsetTop ?? 0;
  let bottom = top + (viewport?.height ?? window.innerHeight);
  for (let el = document.querySelector('[data-lg-league-root]')?.parentElement; el; el = el.parentElement) {
    if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(el).overflowY)) continue;
    const r = el.getBoundingClientRect();
    const scale = el.offsetHeight > 0 ? r.height / el.offsetHeight : 1;
    const clientTop = r.top + el.clientTop * scale;
    top = Math.max(top, clientTop);
    bottom = Math.min(bottom, clientTop + el.clientHeight * scale);
  }
  const allVisible = rects.every(r => r.top >= top && r.bottom <= bottom);
  const centers = rects.map(r => r.top + r.height / 2);
  const firstDropEnd = (centers[0] + centers[1]) / 2;
  const lastDropStart = (centers[SLOT_COUNT - 2] + centers[SLOT_COUNT - 1]) / 2;
  return !(allVisible && firstDropEnd > top && lastDropStart < bottom);
}

const SECTION_BEFORE: Record<number, NoArgKey> = {
  0: 'league.section.gyms',
  8: 'league.section.elite',
  12: 'league.section.champion',
  13: 'league.section.boss',
};

function SlotGlyph({ index, cell }: { index: number; cell: string }) {
  const kind = slotKind(index);
  if (kind === 'gym') return <GymBadges n={index + 1} />;
  if (kind === 'elite') return <Stars n={index - 7} size={9} />;
  if (kind === 'champion') return <Crown size={13} />;
  return <BossBall cell={cell} size={15} />;
}

function SlotRowFace({ position, card, active }: { position: number; card: GymCard; active: boolean }) {
  const view = useLeagueStore((s) => s.view);
  useNamesVersion();
  const shades = card.type || active ? cardShades(card.type) : null;
  const cellColour = shades ? shades.cell : GREY;
  const row = view === 'rematch' ? BOSS_ROW : slotRow(position);
  const cells = deriveRow(card.lines, row, row === BOSS_ROW ? legendsOf(card) : []);
  const filled = card.lines.length > 0;
  const m = useContext(HomeMetricsContext);
  const t = useT();
  useNamesVersion();

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
            <svg viewBox="0 0 22 22" className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem]" aria-label={t('league.type.none')} role="img">
              <rect width="22" height="22" rx="5" fill="#9CA3AF" />
              <path d={starPath(11, 11, 22 * NO_TYPE_STAR_RADIUS)} fill="#ffffff" />
            </svg>
          ) : card.type ? (
            <img src={typeIconPath(card.type)} alt={typeLabel(card.type)} className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem]" />
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
                  key={form ? pokemonSpriteUrl(form.id) : p.sprite}
                  src={form ? pokemonSpriteUrl(form.id) : p.sprite}
                  alt={form ? powerupFormName(form) : spriteAlt(p.name, p.id)}
                  className="max-w-none"
                  style={{
                    width: `${HOME_SPRITE_REM}rem`,
                    height: `${HOME_SPRITE_REM}rem`,
                    imageRendering: SPRITE_RENDERING,
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

function SlotRow({ position, card, held, canDrag }: {
  position: number;
  card: GymCard;
  held: boolean;
  canDrag: boolean;
}) {
  const t = useT();
  const openCardPage = useLeagueUi((s) => s.openCardPage);
  const active = useLeagueUi((s) => s.openCard === position);
  const { setNodeRef: setDragRef, listeners, attributes } = useDraggable({
    id: `slot-${position}`,
    data: { index: position },
    disabled: !canDrag,
    attributes: { roleDescription: t('dnd.roleDescription') },
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
        aria-label={card.lines.length > 0 ? undefined : slotLabel(position)}
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
      ? { baseWidthRem: 26, spriteRem: HOME_SPRITE_REM, targetSpritePx: rule.homeCeilingPx(dpr), dpr }
      : undefined,
    {
      heightRem: (budgetRem) => homeHeightRem(fitHomeLayout(budgetRem, rootPx), rootPx),
      holds: rule.holds,
    },
  );
  const metrics = homeMetrics(fitHomeLayout(fit.budgetRem, rootPx));
  const rendering = spriteRendering(screen, HOME_SPRITE_REM * rootPx * fit.scale, dpr);
  const [preview, setPreview] = useState<{ from: number; to: number; cards: readonly GymCard[] } | null>(null);
  const cards = useLeagueStore((s) => s.cards);
  const blank = cards.every((c) => leagueSlotIsEmpty(c));
  const t = useT();
  const dndAccessibility = useDndAccessibility();

  const displayCards = useMemo(() => {
    if (!preview) return cards;
    return moveLeagueSlots(
      preview.cards,
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
    setPreview({ from: position, to: position, cards: useLeagueStore.getState().cards });
  }, []);

  const onDragOver = useCallback((e: DragOverEvent) => {
    const from = (e.active.data.current as { index: number } | undefined)?.index;
    const to =
      insertIndexFromPointer()
      ?? (e.over?.data.current as { index: number } | undefined)?.index;
    if (from === undefined || to === undefined) return;
    setPreview((cur) => (cur && cur.from === from && cur.to !== to ? { ...cur, to } : cur));
  }, []);

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const from = (e.active.data.current as { index: number } | undefined)?.index;
      const to =
        insertIndexFromPointer()
        ?? (e.over?.data.current as { index: number } | undefined)?.index;
      dragInputIsTouch.current = false;
      dragPointerRef.current = null;
      setPreview(null);
      if (from === undefined || to === undefined || from === to) return;
      moveSlot(from, to);
    },
    [moveSlot],
  );

  return (
    <DndContext
      accessibility={dndAccessibility}
      sensors={sensors}
      collisionDetection={rowCollision}
      autoScroll={{ canScroll: canScrollRows }}
      onDragMove={onDragOver}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragStart={onDragStart}
      onDragCancel={() => {
        dragInputIsTouch.current = false;
        dragPointerRef.current = null;
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
                  <b className="text-[0.5625rem] font-extrabold tracking-[0.07em]">{localeUppercase(t(SECTION_BEFORE[position]))}</b>
                </div>
              )}
              <SlotRow
                position={position}
                card={card}
                held={preview !== null && position === preview.to}
                canDrag={!leagueSlotIsEmpty((preview?.cards ?? cards)[position])}
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
                {blank ? t('league.home.hint.oneAdd') : t('league.home.hint.oneOpen')}
              </span>
            </div>
          ) : metrics.hints === 2 ? (
            <>
              <div className="flex items-start gap-[0.3125rem]">
                <ArrowUpDown className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{t('league.home.hint.reorder')}</span>
              </div>
              <div className="mt-[0.125rem] flex items-start gap-[0.3125rem]">
                {blank ? (
                  <Plus className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
                ) : (
                  <ChevronRight className="mt-[0.0625rem] h-[0.75rem] w-[0.75rem] shrink-0" aria-hidden />
                )}
                <span className="min-w-0 truncate">
                  {blank ? t('league.home.hint.add') : t('league.home.hint.open')}
                </span>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <LeagueRosterNudge fit={fit} />
      </HomeMetricsContext.Provider>
    </DndContext>
  );
}
