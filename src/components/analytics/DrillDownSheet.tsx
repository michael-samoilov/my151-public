import { useState, useRef, useCallback, useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useDrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';

const SHEET_HEIGHT_VH = 85;
const PEEK_HEIGHT = 56; // px — pull tab + title only (above accent line)
const EXPAND_THRESHOLD = 40;
const DISMISS_THRESHOLD = 80;

export function DrillDownSheet() {
  const expandDrillDown = usePokedexStore((s) => s.expandDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);
  const peek = usePokedexStore((s) => s.drillDownPeek);
  const sections = usePokedexStore((s) => s.sections);
  const data = useDrillDownData();

  const [dragY, setDragY] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const isDragging = useRef(false);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(sections)) {
      for (const id of arr) ids.add(id);
    }
    return ids;
  }, [sections]);

  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    isDragging.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    isDragging.current = true;
    setDragY(dy);
    e.preventDefault();
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;

    if (peek) {
      if (dragY < -EXPAND_THRESHOLD) {
        expandDrillDown();
      } else if (dragY > DISMISS_THRESHOLD) {
        closeDrillDown();
      }
    } else {
      if (dragY > DISMISS_THRESHOLD) {
        closeDrillDown();
      }
    }

    setDragY(0);
    dragStartY.current = null;
    isDragging.current = false;
  }, [dragY, peek, expandDrillDown, closeDrillDown]);

  const handleTabTap = useCallback(() => {
    if (!isDragging.current) {
      if (peek) {
        expandDrillDown();
      } else {
        closeDrillDown();
      }
    }
  }, [peek, expandDrillDown, closeDrillDown]);

  if (!data) return null;

  const currentTranslate = peek
    ? `calc(${SHEET_HEIGHT_VH}vh - ${PEEK_HEIGHT}px + ${Math.max(dragY, -(PEEK_HEIGHT))}px)`
    : `${Math.max(dragY, 0)}px`;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      {/* Sheet — no backdrop overlay */}
      <div
        className="pointer-events-auto bg-background rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          height: `${SHEET_HEIGHT_VH}vh`,
          transform: `translateY(${currentTranslate})`,
          transition: dragY === 0 ? 'transform 0.3s ease-out' : 'none',
          overscrollBehavior: 'none',
        }}
      >
        {/* Header — always visible in peek (above accent line) */}
        <div
          className="flex flex-col items-center py-2.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1.5" />
          <div className="flex items-center gap-2">
            {data.icon && (
              <img src={data.icon} alt="" className="w-4 h-4" style={{ imageRendering: 'pixelated' }} />
            )}
            <span className="text-sm font-semibold" style={{ color: data.color }}>
              {data.title}
            </span>
            <span className="text-xs text-muted-foreground">{data.subtitle}</span>
          </div>
        </div>

        {/* Color accent line */}
        <div className="h-[2px] shrink-0" style={{ backgroundColor: data.color, opacity: 0.5 }} />

        {/* Content — scrollable when expanded */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="px-2 pb-2">
            {data.sections.map((section) => (
              <div key={section.sectionId}>
                {/* Sticky section header — matches PokemonBrowser subheader style */}
                <div className="sticky top-0 z-20 bg-background text-[10px] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 border-b">
                  {section.sectionName}
                </div>
                <div className="pt-1">
                  <EvoLineGrid
                    groups={section.groups}
                    assignedIds={assignedIds}
                    stagedIds={emptySet}
                    onToggleStage={noOp}
                    cols={6}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
