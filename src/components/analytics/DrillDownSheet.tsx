import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { usePokedexStore } from '@/store/usePokedexStore';
import { useDrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const SHEET_HEIGHT_VH = 85;
const PEEK_HEIGHT = 68; // px — pull tab + title + subtitle (above accent line)
const EXPAND_THRESHOLD = 40;
const DISMISS_THRESHOLD = 80;
const SWIPE_THRESHOLD = 50; // px horizontal drag to navigate

function getSegmentLabel(seg: import('@/store/usePokedexStore').DrillDownSegment): string {
  switch (seg.kind) {
    case 'type': return seg.type.charAt(0).toUpperCase() + seg.type.slice(1);
    case 'generation': return `Gen ${seg.generation}`;
    case 'evoLevel': return `Lv ${seg.binStart}–${seg.binEnd - 1}`;
    case 'bst': return `${seg.binStart}–${seg.binEnd - 1}`;
    default: return '';
  }
}

export function DrillDownSheet() {
  const expandDrillDown = usePokedexStore((s) => s.expandDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);
  const navigateDrillDown = usePokedexStore((s) => s.navigateDrillDown);
  const peek = usePokedexStore((s) => s.drillDownPeek);
  const sections = usePokedexStore((s) => s.sections);
  const siblings = usePokedexStore((s) => s.drillDownSiblings);
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const data = useDrillDownData();

  const [dragY, setDragY] = useState(0);
  const [dragX, setDragX] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragAxis = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const contentRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(sections)) {
      for (const id of arr) ids.add(id);
    }
    return ids;
  }, [sections]);

  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);

  // Compute prev/next siblings
  const { prevSibling, nextSibling } = useMemo(() => {
    if (!segment || siblings.length < 2) return { prevSibling: null, nextSibling: null };
    const idx = siblings.findIndex(s => JSON.stringify(s) === JSON.stringify(segment));
    if (idx === -1) return { prevSibling: null, nextSibling: null };
    return {
      prevSibling: idx > 0 ? siblings[idx - 1] : null,
      nextSibling: idx < siblings.length - 1 ? siblings[idx + 1] : null,
    };
  }, [segment, siblings]);

  // Lock body scroll when sheet is open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = false;
    dragAxis.current = 'none';
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || dragStartX.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const dx = e.touches[0].clientX - dragStartX.current;

    // Lock axis on first significant movement
    if (dragAxis.current === 'none' && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    isDragging.current = true;

    if (dragAxis.current === 'horizontal' && siblings.length >= 2) {
      setDragX(dx);
      e.preventDefault();
    } else if (dragAxis.current === 'vertical') {
      setDragY(dy);
      e.preventDefault();
    }
  }, [siblings.length]);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;

    if (dragAxis.current === 'horizontal') {
      if (dragX > SWIPE_THRESHOLD && prevSibling) {
        navigateDrillDown(prevSibling);
      } else if (dragX < -SWIPE_THRESHOLD && nextSibling) {
        navigateDrillDown(nextSibling);
      }
    } else if (dragAxis.current === 'vertical') {
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
    }

    setDragY(0);
    setDragX(0);
    dragStartY.current = null;
    dragStartX.current = null;
    isDragging.current = false;
    dragAxis.current = 'none';
  }, [dragY, dragX, peek, expandDrillDown, closeDrillDown, navigateDrillDown, prevSibling, nextSibling]);

  const handleTabTap = useCallback(() => {
    if (!isDragging.current) {
      if (peek) {
        expandDrillDown();
      } else {
        closeDrillDown();
      }
    }
  }, [peek, expandDrillDown, closeDrillDown]);

  // Prevent scroll events on the content from passing through to the page
  const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
    e.stopPropagation();
  }, []);

  if (!data) return null;

  const currentTranslate = peek
    ? `calc(${SHEET_HEIGHT_VH}vh - ${PEEK_HEIGHT}px + ${Math.max(dragY, -(PEEK_HEIGHT))}px)`
    : `${Math.max(dragY, 0)}px`;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50"
      style={{ touchAction: 'none' }}
      onTouchMove={(e) => e.preventDefault()}
    >
      {/* Sheet */}
      <div
        className="bg-background rounded-t-2xl flex flex-col"
        style={{
          height: `${SHEET_HEIGHT_VH}vh`,
          transform: `translateY(${currentTranslate})`,
          transition: dragY === 0 && dragX === 0 ? 'transform 0.3s ease-out' : 'none',
          overscrollBehavior: 'none',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header — always visible in peek (above accent line) */}
        <div
          className="flex flex-col items-center pt-2 pb-2.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1.5" />
          {/* Title row with prev/next navigation */}
          <div className="flex items-center w-full px-3">
            {/* Prev */}
            <div className="flex-1 flex items-center gap-0.5 min-w-0">
              {prevSibling && (
                <button
                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate"
                  onClick={(e) => { e.stopPropagation(); navigateDrillDown(prevSibling); }}
                >
                  <ChevronLeft className="w-3 h-3 shrink-0" />
                  <span className="truncate">{getSegmentLabel(prevSibling)}</span>
                </button>
              )}
            </div>

            {/* Center title */}
            <div className="flex items-center gap-1.5 shrink-0 mx-2">
              {data.icon && (
                <img src={data.icon} alt="" className="w-4 h-4" style={{ imageRendering: 'pixelated' }} />
              )}
              <span className="text-sm font-semibold" style={{ color: data.color }}>
                {data.title}
              </span>
            </div>

            {/* Next */}
            <div className="flex-1 flex items-center justify-end gap-0.5 min-w-0">
              {nextSibling && (
                <button
                  className="flex items-center gap-0.5 text-[10px] text-muted-foreground truncate"
                  onClick={(e) => { e.stopPropagation(); navigateDrillDown(nextSibling); }}
                >
                  <span className="truncate">{getSegmentLabel(nextSibling)}</span>
                  <ChevronRight className="w-3 h-3 shrink-0" />
                </button>
              )}
            </div>
          </div>

          {/* Subtitle on separate line */}
          <span className="text-[10px] text-muted-foreground mt-0.5">{data.subtitle}</span>
        </div>

        {/* Color accent line */}
        <div className="h-[2px] shrink-0" style={{ backgroundColor: data.color, opacity: 0.5 }} />

        {/* Content — scrollable when expanded */}
        <div
          ref={contentRef}
          className="flex-1 min-h-0 overflow-y-auto"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y' }}
          onTouchMove={handleContentTouchMove}
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
