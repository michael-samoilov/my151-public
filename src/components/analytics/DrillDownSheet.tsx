import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { computeDrillDownData, type DrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

const HEADER_HEIGHT = 49; // app header: py-3 + text + border
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
    case 'typeMatchup': return seg.type.charAt(0).toUpperCase() + seg.type.slice(1);
    default: return '';
  }
}

/** Wishiwashi's pokemon.json sprite is the school form, but the BST data
 *  reflects the solo form — show the original solo sprite in BST drilldowns. */
const BST_SPRITE_OVERRIDES: Record<number, string> = { 746: '/sprites/pokemon/746.png' };

/** A full card panel: drag handle + header + accent line + scrollable content */
function CardPanel({
  data,
  assignedIds,
  prevLabel,
  nextLabel,
  scrollRef,
  spriteOverrides,
  onHandleTouchStart,
  onHandleTouchMove,
  onHandleTouchEnd,
  onHandleClick,
  onNavPrev,
  onNavNext,
  swipeLocked,
  removalStagedIds,
  onToggleRemoval,
  onConfirmRemoval,
}: {
  data: DrillDownData;
  assignedIds: Set<number>;
  prevLabel?: string;
  nextLabel?: string;
  scrollRef?: React.RefObject<HTMLDivElement | null>;
  spriteOverrides?: Record<number, string>;
  onHandleTouchStart?: (e: React.TouchEvent) => void;
  onHandleTouchMove?: (e: React.TouchEvent) => void;
  onHandleTouchEnd?: () => void;
  onHandleClick?: () => void;
  onNavPrev?: () => void;
  onNavNext?: () => void;
  swipeLocked?: boolean;
  removalStagedIds?: Set<number>;
  onToggleRemoval?: (memberIds: number[]) => void;
  onConfirmRemoval?: () => void;
}) {
  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);
  const removalCount = removalStagedIds?.size ?? 0;

  return (
    <div className="flex flex-col h-full bg-background rounded-t-2xl overflow-hidden" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
      {/* Pull tab: entire area is draggable (handle + header + subtitle) */}
      <div
        className="shrink-0 touch-none cursor-grab active:cursor-grabbing"
        onTouchStart={onHandleTouchStart}
        onTouchMove={onHandleTouchMove}
        onTouchEnd={onHandleTouchEnd}
        onClick={onHandleClick}
      >
        {/* Drag indicator */}
        <div className="flex items-center justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Card header */}
        <div className="flex flex-col items-center pt-0.5 pb-1.5">
          <div className="flex items-center w-full px-3">
            <div className="flex-1 flex items-center min-w-0">
              {prevLabel && (
                <button type="button"
                  className="flex items-center gap-0.5 text-xs text-muted-foreground truncate"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavPrev?.(); }}
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{prevLabel}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mx-2">
              {data.icon && (
                <img src={data.icon} alt="" className="w-4 h-4" />
              )}
              <span className="text-sm font-semibold" style={{ color: data.color }}>
                {data.title}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-end min-w-0">
              {nextLabel && (
                <button type="button"
                  className="flex items-center gap-0.5 text-xs text-muted-foreground truncate"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavNext?.(); }}
                >
                  <span className="truncate">{nextLabel}</span>
                  <ChevronRight className="w-3.5 h-3.5 shrink-0" />
                </button>
              )}
            </div>
          </div>
          <span className="text-[0.625rem] text-muted-foreground mt-0.5">{data.subtitle}</span>
        </div>
      </div>

      {/* Accent line */}
      <div className="h-[2px] shrink-0" style={{ backgroundColor: data.color, opacity: 0.5 }} />

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 relative"
        style={{
          overflowY: swipeLocked ? 'hidden' : 'auto',
          overscrollBehavior: 'contain',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        <div className="px-2 pb-2" style={{ minHeight: 'calc(100% + 1px)' }}>
          {data.sections.map((section) => (
            <div key={section.sectionId}>
              <div className="sticky top-0 z-20 bg-background text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 border-b">
                {section.sectionName}
              </div>
              <div className="pt-1">
                <EvoLineGrid
                  groups={section.groups}
                  assignedIds={assignedIds}
                  stagedIds={emptySet}
                  onToggleStage={noOp}
                  removalStagedIds={removalStagedIds}
                  onToggleRemoval={onToggleRemoval}
                  spriteOverrides={spriteOverrides}
                  cols={6}
                  variant="analytics"
                  showGenBadges={data.showGenBadges}
                  matchupInfo={data.matchupInfo}
                  matchupType={data.matchupType}
                />
              </div>
            </div>
          ))}
          {/* Extra bottom padding so the floating button doesn't occlude rows */}
          {removalCount > 0 && <div className="h-14" aria-hidden />}
        </div>
      </div>

      {/* Floating "Remove N Pokemon" confirmation button */}
      {removalCount > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40">
          <button type="button"
            onClick={onConfirmRemoval}
            className="bg-destructive text-destructive-foreground px-5 py-2 rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-destructive/90 transition-colors"
          >
            Remove {removalCount} Pokemon
          </button>
        </div>
      )}
    </div>
  );
}

export function DrillDownSheet() {
  const expandDrillDown = usePokedexStore((s) => s.expandDrillDown);
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);
  const navigateDrillDown = usePokedexStore((s) => s.navigateDrillDown);
  const peek = usePokedexStore((s) => s.drillDownPeek);
  const storeSections = usePokedexStore((s) => s.sections);
  const siblings = usePokedexStore((s) => s.drillDownSiblings);
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const excludeSpecial = usePokedexStore((s) => s.drillDownExcludeSpecial);
  const dexId = usePokedexStore((s) => s.drillDownDexId);
  const newOnly = usePokedexStore((s) => s.drillDownNewOnly);

  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);

  const [dragY, setDragY] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeLocked, setSwipeLocked] = useState(false);

  // Staged removals — pending user confirmation
  const [removalStagedIds, setRemovalStagedIds] = useState<number[]>([]);
  const removalStagedSet = useMemo(() => new Set(removalStagedIds), [removalStagedIds]);

  const handleToggleRemoval = useCallback((memberIds: number[]) => {
    setRemovalStagedIds(prev => {
      const prevSet = new Set(prev);
      const allStaged = memberIds.every(id => prevSet.has(id));
      if (allStaged) {
        const removeSet = new Set(memberIds);
        return prev.filter(id => !removeSet.has(id));
      }
      return [...prev, ...memberIds.filter(id => !prevSet.has(id))];
    });
  }, []);

  const handleConfirmRemoval = useCallback(() => {
    const removed = new Set<number>();
    for (const id of removalStagedIds) {
      if (removed.has(id)) continue;
      for (const [sectionId, ids] of Object.entries(storeSections)) {
        if (ids.includes(id)) {
          removeEvoLine(sectionId, id);
          break;
        }
      }
      removed.add(id);
    }
    setRemovalStagedIds([]);
  }, [removalStagedIds, storeSections, removeEvoLine]);
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragAxis = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const sheetRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const currentScrollRef = useRef<HTMLDivElement>(null);
  const pendingNav = useRef<DrillDownSegment | null>(null);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(storeSections)) {
      for (const id of arr) ids.add(id);
    }
    return ids;
  }, [storeSections]);

  // Current index in siblings
  const currentIdx = useMemo(() => {
    if (!segment || siblings.length < 2) return -1;
    return siblings.findIndex(s => JSON.stringify(s) === JSON.stringify(segment));
  }, [segment, siblings]);

  const prevSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx - 1 + siblings.length) % siblings.length] : null;
  const nextSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx + 1) % siblings.length] : null;

  // Current panel data: computed synchronously (blocks render)
  const currentData = useMemo(() =>
    computeDrillDownData(segment, storeSections, excludeSpecial, dexId, newOnly),
    [segment, storeSections, excludeSpecial, dexId, newOnly]);

  // Prev/next panel data: deferred to after paint so the current panel
  // shows instantly even for expensive drilldowns (e.g. national-dex type
  // matchup with ~1025 Pokemon). Computed eagerly if already cached (the
  // computation returns immediately from cache), or scheduled via
  // requestAnimationFrame otherwise.
  const [prevData, setPrevData] = useState<ReturnType<typeof computeDrillDownData>>(null);
  const [nextData, setNextData] = useState<ReturnType<typeof computeDrillDownData>>(null);

  useEffect(() => {
    // Try synchronous first — if cached this is essentially free
    const prev = prevSibling ? computeDrillDownData(prevSibling, storeSections, excludeSpecial, dexId, newOnly) : null;
    const next = nextSibling ? computeDrillDownData(nextSibling, storeSections, excludeSpecial, dexId, newOnly) : null;
    setPrevData(prev);
    setNextData(next);
  }, [prevSibling, nextSibling, storeSections, excludeSpecial, dexId, newOnly]);

  const bstOverrides = segment?.kind === 'bst' ? BST_SPRITE_OVERRIDES : undefined;

  // Only lock body scroll when fully expanded (not peek) — mobile only
  // Desktop uses the side panel (DrillDownPanel), so body scroll must stay free
  useEffect(() => {
    if (!peek) {
      const isDesktop = window.matchMedia('(min-width: 1024px)').matches;
      if (isDesktop) return;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [peek]);

  // Reset scroll + staged removals when segment changes
  useEffect(() => {
    setRemovalStagedIds([]);
    if (currentScrollRef.current) {
      currentScrollRef.current.scrollTop = 0;
    }
  }, [segment]);

  // Handle carousel transitionend: commit the pending navigation
  const justNavigated = useRef(false);
  const handleTransitionEnd = useCallback(() => {
    if (!pendingNav.current) return;
    const target = pendingNav.current;
    pendingNav.current = null;
    justNavigated.current = true;

    // Flush state update synchronously so React updates DOM before browser paints
    flushSync(() => {
      navigateDrillDown(target);
      setSwipeX(0);
      setIsAnimating(false);
    });
  }, [navigateDrillDown]);

  // After navigation state update, snap carousel to center before paint
  useLayoutEffect(() => {
    if (!justNavigated.current) return;
    justNavigated.current = false;
    if (carouselRef.current) {
      carouselRef.current.style.transition = 'none';
      carouselRef.current.style.transform = 'translateX(0px)';
      // Force reflow then re-enable transition
      void carouselRef.current.offsetHeight;
      carouselRef.current.style.transition = '';
      carouselRef.current.style.transform = '';
    }
  }, [segment]);

  const commitSwipe = useCallback((targetSibling: DrillDownSegment, direction: number) => {
    if (!sheetRef.current) return;
    const width = sheetRef.current.offsetWidth;
    pendingNav.current = targetSibling;
    setIsAnimating(true);
    // Animate to the target panel position
    setSwipeX(direction * width);
  }, []);

  // Touch handlers
  const touchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    dragStartY.current = e.touches[0].clientY;
    dragStartX.current = e.touches[0].clientX;
    isDragging.current = false;
    dragAxis.current = 'none';
  }, [isAnimating]);

  const handleHeaderTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || dragStartX.current === null) return;
    const dy = e.touches[0].clientY - dragStartY.current;
    const dx = e.touches[0].clientX - dragStartX.current;

    if (dragAxis.current === 'none' && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
      dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }
    isDragging.current = true;

    if (dragAxis.current === 'horizontal' && siblings.length >= 2) {
      setSwipeLocked(true);
      setSwipeX(dx);
      e.preventDefault();
    } else if (dragAxis.current === 'vertical') {
      setDragY(dy);
      e.preventDefault();
    }
  }, [siblings.length]);

  const handleContentTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null || dragStartX.current === null) return;
    const dx = e.touches[0].clientX - dragStartX.current;
    const dy = e.touches[0].clientY - dragStartY.current;

    if (dragAxis.current === 'none' && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'horizontal' : 'vertical';
    }

    if (dragAxis.current === 'horizontal' && siblings.length >= 2) {
      isDragging.current = true;
      setSwipeLocked(true);
      setSwipeX(dx);
      e.preventDefault();
    } else if (dragAxis.current === 'horizontal') {
      setSwipeLocked(true);
      e.preventDefault();
    }
  }, [siblings.length]);

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
    setSwipeLocked(false);
  }, [swipeX, dragY, peek, expandDrillDown, closeDrillDown, prevSibling, nextSibling, commitSwipe]);

  const handleTabTap = useCallback(() => {
    if (!isDragging.current) {
      if (peek) expandDrillDown();
      else closeDrillDown();
    }
  }, [peek, expandDrillDown, closeDrillDown]);

  const handleNavPrev = useCallback(() => {
    if (isAnimating || !prevSibling) return;
    commitSwipe(prevSibling, 1);
  }, [isAnimating, prevSibling, commitSwipe]);

  const handleNavNext = useCallback(() => {
    if (isAnimating || !nextSibling) return;
    commitSwipe(nextSibling, -1);
  }, [isAnimating, nextSibling, commitSwipe]);

  if (!currentData) return null;

  const sheetHeight = `calc(100dvh - ${HEADER_HEIGHT}px)`;

  const currentTranslateY = peek
    ? `calc(100dvh - ${HEADER_HEIGHT}px - ${PEEK_HEIGHT}px + ${Math.max(dragY, -(PEEK_HEIGHT))}px)`
    : `${Math.max(dragY, 0)}px`;

  // At rest (fully expanded, no drag), avoid transform to prevent GPU compositing blur
  const isAtRest = !peek && dragY === 0;

  return (
    <div className={`${peek ? 'fixed' : 'absolute'} inset-x-0 bottom-0 z-50 pointer-events-none md:hidden`}>
      <div
        ref={sheetRef}
        className="pointer-events-auto"
        style={{
          height: sheetHeight,
          transform: isAtRest ? undefined : `translateY(${currentTranslateY})`,
          transition: dragY === 0 && !isAnimating ? 'transform 0.3s ease-out' : 'none',
          overscrollBehavior: 'none',
        }}
      >
        {/* Carousel container clips horizontal overflow to hide prev/next panels */}
        <div className="h-full relative overflow-x-clip">
          <div
            ref={carouselRef}
            className="absolute inset-0 flex"
            style={{
              width: '300%',
              left: '-100%',
              transform: swipeX === 0 && !isAnimating ? undefined : `translateX(${swipeX}px)`,
              transition: isAnimating ? 'transform 0.28s ease-out' : 'none',
              willChange: isAnimating || swipeX !== 0 ? 'transform' : undefined,
            }}
            onTransitionEnd={handleTransitionEnd}
          >
            {/* Panel wrappers keyed by segment identity — when the user
                swipes from B→C, React physically MOVES C's wrapper div
                from index 2 to index 1 (preserving its <img> DOM nodes
                and painted sprites) instead of destroying index 2 and
                rebuilding index 1 from scratch (which flashes white). */}
            <div
              key={prevSibling ? JSON.stringify(prevSibling) : 'empty-prev'}
              className="h-full flex-1 min-w-0"
              style={{ clipPath: 'inset(-100px 0 0 0)' }}
              onTouchStart={touchStart}
              onTouchMove={handleContentTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {prevData && prevSibling && (
                <CardPanel
                  data={prevData}
                  assignedIds={assignedIds}
                  prevLabel={siblings.length >= 3 ? getSegmentLabel(siblings[(currentIdx - 2 + siblings.length) % siblings.length]) : undefined}
                  nextLabel={getSegmentLabel(segment!)}
                  spriteOverrides={bstOverrides}
                  onHandleTouchStart={touchStart}
                  onHandleTouchMove={handleHeaderTouchMove}
                  onHandleTouchEnd={handleTouchEnd}
                  onHandleClick={handleTabTap}
                  onNavPrev={handleNavPrev}
                  onNavNext={handleNavNext}
                  swipeLocked={swipeLocked}
                />
              )}
            </div>

            {/* Current panel */}
            <div
              key={segment ? JSON.stringify(segment) : 'empty-current'}
              className="h-full flex-1 min-w-0"
              style={{ clipPath: 'inset(-100px 0 0 0)' }}
              onTouchStart={touchStart}
              onTouchMove={handleContentTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <CardPanel
                data={currentData}
                assignedIds={assignedIds}
                prevLabel={prevSibling ? getSegmentLabel(prevSibling) : undefined}
                nextLabel={nextSibling ? getSegmentLabel(nextSibling) : undefined}
                scrollRef={currentScrollRef}
                spriteOverrides={bstOverrides}
                onHandleTouchStart={touchStart}
                onHandleTouchMove={handleHeaderTouchMove}
                onHandleTouchEnd={handleTouchEnd}
                onHandleClick={handleTabTap}
                onNavPrev={handleNavPrev}
                onNavNext={handleNavNext}
                swipeLocked={swipeLocked}
                removalStagedIds={removalStagedSet}
                onToggleRemoval={handleToggleRemoval}
                onConfirmRemoval={handleConfirmRemoval}
              />
            </div>

            {/* Next panel */}
            <div
              key={nextSibling ? JSON.stringify(nextSibling) : 'empty-next'}
              className="h-full flex-1 min-w-0"
              style={{ clipPath: 'inset(-100px 0 0 0)' }}
              onTouchStart={touchStart}
              onTouchMove={handleContentTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {nextData && nextSibling && (
                <CardPanel
                  data={nextData}
                  assignedIds={assignedIds}
                  prevLabel={getSegmentLabel(segment!)}
                  nextLabel={siblings.length >= 3 ? getSegmentLabel(siblings[(currentIdx + 2) % siblings.length]) : undefined}
                  spriteOverrides={bstOverrides}
                  onHandleTouchStart={touchStart}
                  onHandleTouchMove={handleHeaderTouchMove}
                  onHandleTouchEnd={handleTouchEnd}
                  onHandleClick={handleTabTap}
                  onNavPrev={handleNavPrev}
                  onNavNext={handleNavNext}
                  swipeLocked={swipeLocked}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Desktop side panel for analytics drilldown — no drag/carousel, static layout */
export function DrillDownPanel() {
  const closeDrillDown = usePokedexStore((s) => s.closeDrillDown);
  const navigateDrillDown = usePokedexStore((s) => s.navigateDrillDown);
  const removeEvoLine = usePokedexStore((s) => s.removeEvoLine);
  const storeSections = usePokedexStore((s) => s.sections);
  const siblings = usePokedexStore((s) => s.drillDownSiblings);
  const segment = usePokedexStore((s) => s.drillDownSegment);
  const excludeSpecial = usePokedexStore((s) => s.drillDownExcludeSpecial);
  const dexId = usePokedexStore((s) => s.drillDownDexId);
  const newOnly = usePokedexStore((s) => s.drillDownNewOnly);

  const assignedIds = useMemo(() => {
    const ids = new Set<number>();
    for (const arr of Object.values(storeSections)) {
      for (const id of arr) ids.add(id);
    }
    return ids;
  }, [storeSections]);

  const currentIdx = useMemo(() => {
    if (!segment || siblings.length < 2) return -1;
    return siblings.findIndex(s => JSON.stringify(s) === JSON.stringify(segment));
  }, [segment, siblings]);

  const prevSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx - 1 + siblings.length) % siblings.length] : null;
  const nextSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx + 1) % siblings.length] : null;

  const currentData = useMemo(() =>
    computeDrillDownData(segment, storeSections, excludeSpecial, dexId, newOnly),
    [segment, storeSections, excludeSpecial, dexId, newOnly]);

  const desktopBstOverrides = segment?.kind === 'bst' ? BST_SPRITE_OVERRIDES : undefined;

  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);

  // Staged removals — pending user confirmation
  const [removalStagedIds, setRemovalStagedIds] = useState<number[]>([]);
  const removalStagedSet = useMemo(() => new Set(removalStagedIds), [removalStagedIds]);

  const handleToggleRemoval = useCallback((memberIds: number[]) => {
    setRemovalStagedIds(prev => {
      const prevSet = new Set(prev);
      const allStaged = memberIds.every(id => prevSet.has(id));
      if (allStaged) {
        const removeSet = new Set(memberIds);
        return prev.filter(id => !removeSet.has(id));
      }
      return [...prev, ...memberIds.filter(id => !prevSet.has(id))];
    });
  }, []);

  const handleConfirmRemoval = useCallback(() => {
    const removed = new Set<number>();
    for (const id of removalStagedIds) {
      if (removed.has(id)) continue;
      for (const [sectionId, ids] of Object.entries(storeSections)) {
        if (ids.includes(id)) {
          removeEvoLine(sectionId, id);
          break;
        }
      }
      removed.add(id);
    }
    setRemovalStagedIds([]);
  }, [removalStagedIds, storeSections, removeEvoLine]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset staged removals when navigating to a different segment
  useEffect(() => {
    setRemovalStagedIds([]);
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [segment]);

  if (!currentData) return null;

  return (
    <div className="relative flex flex-col h-full bg-background w-full">
      {/* Header */}
      <div className="shrink-0 border-b">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {currentData.icon && (
              <img src={currentData.icon} alt="" className="w-4 h-4 shrink-0" />
            )}
            <span className="text-sm font-semibold truncate" style={{ color: currentData.color }}>
              {currentData.title}
            </span>
          </div>
          <button type="button"
            onClick={closeDrillDown}
            className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-3 pb-1.5 text-[0.625rem] text-muted-foreground -mt-0.5">
          {currentData.subtitle}
        </div>
        {/* Prev / Next navigation */}
        {(prevSibling || nextSibling) && (
          <div className="flex items-center justify-between px-3 pb-2">
            {prevSibling ? (
              <button type="button"
                onClick={() => navigateDrillDown(prevSibling)}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate max-w-[100px]">{getSegmentLabel(prevSibling)}</span>
              </button>
            ) : <div />}
            {nextSibling ? (
              <button type="button"
                onClick={() => navigateDrillDown(nextSibling)}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span className="truncate max-w-[100px]">{getSegmentLabel(nextSibling)}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            ) : <div />}
          </div>
        )}
        {/* Accent line */}
        <div className="h-[2px]" style={{ backgroundColor: currentData.color, opacity: 0.5 }} />
      </div>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto"
      >
        <div className="px-2 pb-2">
          {currentData.sections.map((section) => (
            <div key={section.sectionId}>
              <div className="sticky top-0 z-20 bg-background text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 border-b">
                {section.sectionName}
              </div>
              <div className="pt-1">
                <EvoLineGrid
                  groups={section.groups}
                  assignedIds={assignedIds}
                  stagedIds={emptySet}
                  onToggleStage={noOp}
                  removalStagedIds={removalStagedSet}
                  onToggleRemoval={handleToggleRemoval}
                  spriteOverrides={desktopBstOverrides}
                  cols={6}
                  variant="analytics"
                  showGenBadges={currentData.showGenBadges}
                  matchupInfo={currentData.matchupInfo}
                  matchupType={currentData.matchupType}
                />
              </div>
            </div>
          ))}
        </div>
        {/* Extra bottom padding so the floating button doesn't occlude rows */}
        {removalStagedIds.length > 0 && <div className="h-14" aria-hidden />}
      </div>

      {/* Floating "Remove N Pokemon" confirmation button */}
      {removalStagedIds.length > 0 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-40">
          <button type="button"
            onClick={handleConfirmRemoval}
            className="bg-destructive text-destructive-foreground px-5 py-2 rounded-full shadow-lg text-sm font-semibold cursor-pointer hover:bg-destructive/90 transition-colors"
          >
            Remove {removalStagedIds.length} Pokemon
          </button>
        </div>
      )}
    </div>
  );
}
