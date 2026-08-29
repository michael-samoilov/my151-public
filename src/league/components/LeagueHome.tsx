import { useCallback } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { getPokemonById } from '@/hooks/usePokemonData';
import { typeIconPath } from '@/data/type-ids';
import { cn } from '@/lib/utils';
import { BOSS_ROW, SLOT_COUNT, slotKind, slotRow } from '../model/constants';
import { deriveRow } from '../model/engine';
import { cardShades } from '../theme';
import { useLeagueStore } from '../store/useLeagueStore';
import { useLeagueUi } from '../store/useLeagueUi';
import { BossBall, Crown, EmptySlotBall, GymBadges, Stars } from './glyphs';

/**
 * The league home: the card, zoomed out. One row per slot, led by the glyph
 * cell and the type chip, teams right-aligned; four red spacers; rows drag
 * to reorder and tap to open their card.
 */

const ROW_H = 2.75; // 44px
const BAND_H = 1.25;
const GREY = '#a3a3a3';
const BAND_RED = '#dc2626';

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

function SlotRow({ index }: { index: number }) {
  const card = useLeagueStore((s) => s.cards[index]);
  const openCardPage = useLeagueUi((s) => s.openCardPage);
  const { setNodeRef: setDragRef, listeners, attributes, isDragging } = useDraggable({
    id: `slot-${index}`,
    data: { index },
  });
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `slotdrop-${index}`, data: { index } });

  const shades = card.type ? cardShades(card.type) : null;
  const cellColour = shades ? shades.cell : GREY;
  const row = slotRow(index);
  const cells = deriveRow(card.lines, row, slotRow(index) === BOSS_ROW ? card.legend : null);
  const filled = card.lines.length > 0;

  return (
    <div ref={setDropRef}>
      <button
        type="button"
        ref={setDragRef}
        {...listeners}
        {...attributes}
        data-testid={`league-slot-${index}`}
        onClick={() => openCardPage(index)}
        className={cn(
          'grid w-full cursor-pointer items-center text-left',
          isDragging && 'opacity-30',
          isOver && 'ring-2 ring-primary/50',
        )}
        style={{
          gridTemplateColumns: '2.75rem 2rem repeat(7, minmax(0, 1fr))',
          height: `${ROW_H}rem`,
          background: shades ? shades.base : undefined,
          boxShadow: 'inset 0 1px 0 #f0f0f1',
          touchAction: 'none',
        }}
      >
        <span
          className="mx-[0.1875rem] flex items-center justify-center self-center rounded-[0.3125rem]"
          style={{ height: `${ROW_H - 0.625}rem`, background: cellColour }}
        >
          <SlotGlyph index={index} cell={cellColour} />
        </span>
        <span className="flex items-center justify-center">
          {card.type ? (
            <img src={typeIconPath(card.type)} alt={card.type} className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem]" />
          ) : (
            <span className="h-[1.375rem] w-[1.375rem] rounded-[0.3125rem] border-[1.4px] border-dashed border-[#d4d4d4]" />
          )}
        </span>
        {Array.from({ length: 7 - cells.length }, (_, k) => (
          <span key={`sp-${k}`} />
        ))}
        {cells.map((cell) => {
          const p = cell.pokemonId !== null ? getPokemonById(cell.pokemonId) : undefined;
          const addTile = !filled && cell.seat === 1;
          return (
            <span key={cell.seat} className="flex items-center justify-center">
              {p ? (
                <img
                  src={p.sprite}
                  alt={p.name}
                  className="max-w-none"
                  style={{ width: '2.125rem', height: '2.125rem', imageRendering: 'pixelated' }}
                />
              ) : addTile ? (
                <span className="flex h-[1.875rem] w-[1.875rem] items-center justify-center rounded-md border-[1.4px] border-dashed border-[#d4d4d4]">
                  <svg viewBox="0 0 16 16" className="h-[0.6875rem] w-[0.6875rem]">
                    <line x1="3" y1="8" x2="13" y2="8" stroke="#a3a3a3" strokeWidth="1.8" strokeLinecap="round" />
                    <line x1="8" y1="3" x2="8" y2="13" stroke="#a3a3a3" strokeWidth="1.8" strokeLinecap="round" />
                  </svg>
                </span>
              ) : filled ? (
                <EmptySlotBall size={18} />
              ) : null}
            </span>
          );
        })}
      </button>
    </div>
  );
}

export function LeagueHome() {
  const moveSlot = useLeagueStore((s) => s.moveSlot);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const onDragEnd = useCallback(
    (e: DragEndEvent) => {
      const from = (e.active.data.current as { index: number } | undefined)?.index;
      const to = (e.over?.data.current as { index: number } | undefined)?.index;
      if (from === undefined || to === undefined || from === to) return;
      moveSlot(from, to);
    },
    [moveSlot],
  );

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="rounded-xl bg-card p-1 px-2 shadow-elevated">
        {Array.from({ length: SLOT_COUNT }, (_, i) => (
          <div key={i}>
            {SECTION_BEFORE[i] && (
              <div
                className={cn('flex items-center rounded-[0.3125rem] px-2 text-white', i > 0 && 'mt-px')}
                style={{ height: `${BAND_H}rem`, background: BAND_RED }}
              >
                <b className="text-[0.5625rem] font-extrabold tracking-[0.07em]">{SECTION_BEFORE[i]}</b>
              </div>
            )}
            <SlotRow index={i} />
          </div>
        ))}
      </div>
      <div className="px-[0.375rem] pt-2 text-[0.625rem] text-muted-foreground">
        ↕ Drag a row to reorder the league · tap a row to open its card
      </div>
    </DndContext>
  );
}
