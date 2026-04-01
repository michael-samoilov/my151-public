import { useState, useRef, useCallback, useMemo } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useDrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';

const SHEET_HEIGHT_VH = 85;
const PEEK_HEIGHT = 80; // px — header + pull tab
const EXPAND_THRESHOLD = 40; // upward drag px to expand
const DISMISS_THRESHOLD = 80; // downward drag px to dismiss/collapse

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
      // In peek mode: drag up expands, drag down dismisses
      if (dragY < -EXPAND_THRESHOLD) {
        expandDrillDown();
      } else if (dragY > DISMISS_THRESHOLD) {
        closeDrillDown();
      }
    } else {
      // In full mode: drag down collapses back to peek
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

  const overlayOpacity = peek
    ? Math.max(0, 0.2 - dragY / (DISMISS_THRESHOLD * 3))
    : Math.max(0, 0.5 - dragY / (DISMISS_THRESHOLD * 3));

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black"
        onClick={closeDrillDown}
        style={{ opacity: overlayOpacity }}
      />

      {/* Sheet */}
      <div
        className="absolute bottom-0 left-0 right-0 bg-background rounded-t-2xl shadow-2xl flex flex-col"
        style={{
          height: `${SHEET_HEIGHT_VH}vh`,
          transform: `translateY(${currentTranslate})`,
          transition: dragY === 0 ? 'transform 0.3s ease-out' : 'none',
          overscrollBehavior: 'none',
        }}
      >
        {/* Header — always visible */}
        <div
          className="flex flex-col items-center py-3 cursor-grab active:cursor-grabbing touch-none shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-2" />
          <div className="flex items-center gap-2">
            {data.icon && (
              <img src={data.icon} alt="" className="w-4 h-4" style={{ imageRendering: 'pixelated' }} />
            )}
            <span className="text-sm font-semibold" style={{ color: data.color }}>
              {data.title}
            </span>
          </div>
          <span className="text-xs text-muted-foreground mt-0.5">{data.subtitle}</span>
        </div>

        {/* Color accent line */}
        <div className="h-[2px] shrink-0" style={{ backgroundColor: data.color, opacity: 0.5 }} />

        {/* Content — scrollable when expanded */}
        <div
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ overscrollBehavior: 'contain' }}
        >
          <div className="p-3 space-y-4">
            {data.sections.map((section) => (
              <div key={section.sectionId}>
                <div className="flex items-center gap-2 mb-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: section.sectionColor }}
                  />
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {section.sectionName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    ({section.groups.length})
                  </span>
                </div>
                <EvoLineGrid
                  groups={section.groups}
                  assignedIds={assignedIds}
                  stagedIds={emptySet}
                  onToggleStage={noOp}
                  cols={6}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
