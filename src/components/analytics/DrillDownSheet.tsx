import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { useDrillDownData, computeDrillDownData, type DrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';
import { ChevronLeft, ChevronRight } from 'lucide-react';
const SHEET_HEIGHT_VH = 85;
const PEEK_HEIGHT = 68;
const EXPAND_THRESHOLD = 40;
const DISMISS_THRESHOLD = 80;
const SWIPE_THRESHOLD = 50;

function getSegmentLabel(seg: DrillDownSegment): string {
  switch (seg.kind) {
    case 'type': return seg.type.charAt(0).toUpperCase() + seg.type.slice(1);
    case 'generation': return `Gen ${seg.generation}`;
    case 'evoLevel': return `Lv ${seg.binStart}–${seg.binEnd - 1}`;
    case 'bst': return `${seg.binStart}–${seg.binEnd - 1}`;
    default: return '';
  }
}

/** Renders one page of drill-down content */
function DrillDownPage({
  data,
  assignedIds,
}: {
  data: DrillDownData;
  assignedIds: Set<number>;
}) {
  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);

  return (
    <div className="px-2 pb-2" style={{ minHeight: 'calc(100% + 1px)' }}>
      {data.sections.map((section) => (
        <div key={section.sectionId}>
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
  );
}

export function DrillDownSheet() {
  const expandDrillDown = usePokedexStore((s) => s.expandDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);
  const navigateDrillDown = usePokedexStore((s) => s.navigateDrillDown);
  const peek = usePokedexStore((s) => s.drillDownPeek);
  const sections = usePokedexStore((s) => s.sections);
  const siblings = usePokedexStore((s) => s.drillDownSiblings);
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const excludeSpecial = usePokedexStore((s) => s.drillDownExcludeSpecial);
  const data = useDrillDownData();

  const [dragY, setDragY] = useState(0);
  const [swipeX, setSwipeX] = useState(0); // unified horizontal drag from either header or content
  const [isAnimatingSwipe, setIsAnimatingSwipe] = useState(false);
  const [animateTarget, setAnimateTarget] = useState(0);
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragAxis = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const contentRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(sections)) {
      for (const id of arr) ids.add(id);
    }
    return ids;
  }, [sections]);

  // Compute prev/next siblings with wrap-around
  const { prevSibling, nextSibling } = useMemo(() => {
    if (!segment || siblings.length < 2) return { prevSibling: null, nextSibling: null };
    const idx = siblings.findIndex(s => JSON.stringify(s) === JSON.stringify(segment));
    if (idx === -1) return { prevSibling: null, nextSibling: null };
    return {
      prevSibling: siblings[(idx - 1 + siblings.length) % siblings.length],
      nextSibling: siblings[(idx + 1) % siblings.length],
    };
  }, [segment, siblings]);

  // Pre-compute adjacent panel data for carousel
  const prevData = useMemo(() =>
    prevSibling ? computeDrillDownData(prevSibling, sections, excludeSpecial) : null,
    [prevSibling, sections, excludeSpecial]);
  const nextData = useMemo(() =>
    nextSibling ? computeDrillDownData(nextSibling, sections, excludeSpecial) : null,
    [nextSibling, sections, excludeSpecial]);

  // Only lock body scroll when fully expanded (not peek)
  useEffect(() => {
    if (!peek) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [peek]);

  // Shared touch start for both header and content
  const touchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimatingSwipe) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = false;
    dragAxis.current = 'none';
  }, [isAnimatingSwipe]);

  // Header touch move: supports both vertical and horizontal
  const handleHeaderTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || dragStartX.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const dx = e.touches[0].clientX - dragStartX.current;

    if (dragAxis.current === 'none' && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    isDragging.current = true;

    if (dragAxis.current === 'horizontal' && siblings.length >= 2) {
      setSwipeX(dx);
      e.preventDefault();
    } else if (dragAxis.current === 'vertical') {
      setDragY(dy);
      e.preventDefault();
    }
  }, [siblings.length]);

  // Content touch move: horizontal → swipe, vertical → native scroll
  const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || dragStartX.current === null) return;
    const dx = e.touches[0].clientX - dragStartX.current;
    const dy = e.touches[0].clientY - dragStartY.current;

    if (dragAxis.current === 'none' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (dragAxis.current === 'horizontal' && siblings.length >= 2) {
      isDragging.current = true;
      setSwipeX(dx);
      e.preventDefault();
    }
    // vertical = native scroll, don't interfere
  }, [siblings.length]);

  const commitSwipe = useCallback((targetSibling: DrillDownSegment | null, direction: number) => {
    if (!targetSibling || !sheetRef.current) {
      setSwipeX(0);
      return;
    }
    const width = sheetRef.current.offsetWidth;
    setAnimateTarget(direction * width);
    setIsAnimatingSwipe(true);

    // After animation completes, commit navigation and reset
    setTimeout(() => {
      navigateDrillDown(targetSibling);
      setSwipeX(0);
      setAnimateTarget(0);
      setIsAnimatingSwipe(false);
    }, 250);
  }, [navigateDrillDown]);

  const handleTouchEnd = useCallback(() => {
    if (dragStartY.current === null) return;

    if (dragAxis.current === 'horizontal') {
      if (swipeX > SWIPE_THRESHOLD && prevSibling) {
        commitSwipe(prevSibling, 1);
      } else if (swipeX < -SWIPE_THRESHOLD && nextSibling) {
        commitSwipe(nextSibling, -1);
      } else {
        setSwipeX(0);
      }
    } else if (dragAxis.current === 'vertical') {
      if (peek) {
        if (dragY < -EXPAND_THRESHOLD) expandDrillDown();
        else if (dragY > DISMISS_THRESHOLD) closeDrillDown();
      } else {
        if (dragY > DISMISS_THRESHOLD) closeDrillDown();
      }
      setDragY(0);
    }

    dragStartY.current = null;
    dragStartX.current = null;
    isDragging.current = false;
    dragAxis.current = 'none';
  }, [swipeX, dragY, peek, expandDrillDown, closeDrillDown, prevSibling, nextSibling, commitSwipe]);

  const handleTabTap = useCallback(() => {
    if (!isDragging.current) {
      if (peek) expandDrillDown();
      else closeDrillDown();
    }
  }, [peek, expandDrillDown, closeDrillDown]);

  const handleNavClick = useCallback((e: React.MouseEvent, target: DrillDownSegment) => {
    e.stopPropagation();
    navigateDrillDown(target);
  }, [navigateDrillDown]);

  if (!data) return null;

  const currentTranslateY = peek
    ? `calc(${SHEET_HEIGHT_VH}vh - ${PEEK_HEIGHT}px + ${Math.max(dragY, -(PEEK_HEIGHT))}px)`
    : `${Math.max(dragY, 0)}px`;

  // Carousel X offset: during drag use swipeX, during animation use animateTarget
  const carouselX = isAnimatingSwipe ? animateTarget : swipeX;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 pointer-events-none">
      <div
        ref={sheetRef}
        className="pointer-events-auto bg-background rounded-t-2xl flex flex-col overflow-hidden"
        style={{
          height: `${SHEET_HEIGHT_VH}vh`,
          transform: `translateY(${currentTranslateY})`,
          transition: dragY === 0 && !isAnimatingSwipe ? 'transform 0.3s ease-out' : (isAnimatingSwipe ? 'none' : 'none'),
          overscrollBehavior: 'none',
          boxShadow: '0 -4px 16px rgba(0,0,0,0.15)',
        }}
      >
        {/* Header — always visible in peek */}
        <div
          className="flex flex-col items-center pt-2 pb-2.5 cursor-grab active:cursor-grabbing touch-none shrink-0"
          onTouchStart={touchStart}
          onTouchMove={handleHeaderTouchMove}
          onTouchEnd={handleTouchEnd}
          onClick={handleTabTap}
        >
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30 mb-1.5" />
          <div className="flex items-center w-full px-3">
            {/* Prev */}
            <div className="flex-1 flex items-center min-w-0">
              {prevSibling && (
                <button
                  className="flex items-center gap-0.5 text-xs text-muted-foreground truncate py-1 pr-2 -ml-1 cursor-pointer"
                  onClick={(e) => handleNavClick(e, prevSibling)}
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
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
            <div className="flex-1 flex items-center justify-end min-w-0">
              {nextSibling && (
                <button
                  className="flex items-center gap-0.5 text-xs text-muted-foreground truncate py-1 pl-2 -mr-1 cursor-pointer"
                  onClick={(e) => handleNavClick(e, nextSibling)}
                >
                  <span className="truncate">{getSegmentLabel(nextSibling)}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}
            </div>
          </div>

          <span className="text-[10px] text-muted-foreground mt-0.5">{data.subtitle}</span>
        </div>

        <div className="h-[2px] shrink-0" style={{ backgroundColor: data.color, opacity: 0.5 }} />

        {/* Carousel — 3 panels side by side, translated by swipe */}
        <div
          className="flex-1 min-h-0 relative"
          style={{ overflow: 'hidden' }}
        >
          <div
            className="absolute inset-0 flex"
            style={{
              width: '300%',
              left: '-100%',
              transform: `translateX(${carouselX}px)`,
              transition: isAnimatingSwipe ? 'transform 0.25s ease-out' : 'none',
            }}
          >
            {/* Prev panel */}
            <div className="w-1/3 h-full overflow-hidden">
              {prevData && (
                <div className="h-full overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                  <DrillDownPage data={prevData} assignedIds={assignedIds} />
                </div>
              )}
            </div>

            {/* Current panel */}
            <div className="w-1/3 h-full overflow-hidden">
              <div
                ref={contentRef}
                className="h-full overflow-y-auto"
                style={{ overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' }}
                onTouchStart={touchStart}
                onTouchMove={handleContentTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                <DrillDownPage data={data} assignedIds={assignedIds} />
              </div>
            </div>

            {/* Next panel */}
            <div className="w-1/3 h-full overflow-hidden">
              {nextData && (
                <div className="h-full overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>
                  <DrillDownPage data={nextData} assignedIds={assignedIds} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
