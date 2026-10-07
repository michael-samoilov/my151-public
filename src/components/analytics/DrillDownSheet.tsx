import { startTransition, useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from 'react';
import { flushSync } from 'react-dom';
import { usePokedexStore, type DrillDownSegment } from '@/store/usePokedexStore';
import { computeDrillDownData, type DrillDownData } from '@/hooks/useDrillDownData';
import { EvoLineGrid } from '@/components/browser/EvoLineCard';
import { ShapeIconCircle } from '@/components/shared/ShapeIcon';
import { shapeLabel, typeLabel } from '@/i18n';
import type { ShapeName, TypeName } from '@/types/pokemon';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { pokemonSpriteUrl } from '@/lib/spriteUrl';

const PEEK_HEIGHT = 68;
const EXPAND_THRESHOLD = 40;
const DISMISS_THRESHOLD = 80;
const SWIPE_THRESHOLD = 50;

/** A tool supplies data and navigation; the sheet and pane own presentation. */
export interface AnalyticsDrillDownItem {
  id: string;
  label: string;
  shape?: ShapeName;
  getData: () => DrillDownData | null;
  onSelect: () => void;
}
export interface AnalyticsDrillDownProps {
  panelAttributes?: Record<string, string>;
  segment: AnalyticsDrillDownItem | null;
  siblings: AnalyticsDrillDownItem[];
  assignedIds: Set<number>;
  closeDrillDown: () => void;
  expandDrillDown?: () => void;
  peek?: boolean;
  spriteOverrides?: Record<number, string>;
  removalStagedIds?: number[];
  handleToggleRemoval?: (memberIds: number[]) => void;
  handleConfirmRemoval?: () => void;
}
const getSegmentLabel = (segment: AnalyticsDrillDownItem) => segment.label;
const getSegmentShape = (segment: AnalyticsDrillDownItem) => segment.shape;
const computeData = (segment: AnalyticsDrillDownItem | null) => segment?.getData() ?? null;

/** Wishiwashi's pokemon.json sprite is the school form, but the BST data
 *  reflects the solo form — show the original solo sprite in BST drilldowns. */
const BST_SPRITE_OVERRIDES: Record<number, string> = { 746: pokemonSpriteUrl(746) };

/** A full card panel: drag handle + header + accent line + scrollable content */
function CardPanel({
  data,
  panelAttributes,
  assignedIds,
  prevLabel,
  nextLabel,
  prevShape,
  nextShape,
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
  panelAttributes?: Record<string, string>;
  assignedIds: Set<number>;
  prevLabel?: string;
  nextLabel?: string;
  prevShape?: ShapeName;
  nextShape?: ShapeName;
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
    <div {...panelAttributes} className="flex flex-col h-full bg-background rounded-t-2xl overflow-hidden" style={{ boxShadow: '0 -4px 20px rgba(0,0,0,0.2)' }}>
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
                  className="flex items-center gap-0.5 text-xs text-muted-foreground min-w-0"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavPrev?.(); }}
                >
                  <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                  <span className="flex flex-col items-center min-w-0 leading-tight">
                    <span className="truncate max-w-full">{prevLabel}</span>
                    {prevShape && <ShapeIconCircle shape={prevShape} className="mt-0.5" />}
                  </span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 shrink-0 mx-2">
              {data.icon && (
                <img src={data.icon} alt="" className="w-4 h-4" />
              )}
              {data.headerContent}
              {data.shape && (
                <ShapeIconCircle shape={data.shape} />
              )}
              <span className="text-sm font-semibold" style={{ color: data.color }}>
                {data.title}
              </span>
            </div>
            <div className="flex-1 flex items-center justify-end min-w-0">
              {nextLabel && (
                <button type="button"
                  className="flex items-center gap-0.5 text-xs text-muted-foreground min-w-0"
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); onNavNext?.(); }}
                >
                  <span className="flex flex-col items-center min-w-0 leading-tight">
                    <span className="truncate max-w-full">{nextLabel}</span>
                    {nextShape && <ShapeIconCircle shape={nextShape} className="mt-0.5" />}
                  </span>
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
          {data.emptyContent}
          {data.sections.map((section) => (
            <div key={section.sectionId} {...section.attributes}>
              <div className="sticky top-0 z-20 bg-background text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 mt-1 border-b">
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
                  standaloneTiles={data.standaloneTiles}
                  cols={6}
                  variant="analytics"
                  showGenBadges={data.showGenBadges}
                  showShapeBadges={data.showShapeBadges}
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

/** `topGap` is the space in px above the expanded sheet. App passes the
 *  header's measured height, so the nav tabs stay visible and tappable. */
export function AnalyticsDrillDownSheet({ topGap, panelAttributes, segment, siblings, assignedIds, closeDrillDown, expandDrillDown = () => {}, peek = false, spriteOverrides, removalStagedIds = [], handleToggleRemoval, handleConfirmRemoval }: AnalyticsDrillDownProps & { topGap: number }) {
  const [dragY, setDragY] = useState(0);
  const [swipeX, setSwipeX] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [swipeLocked, setSwipeLocked] = useState(false);
  const removalStagedSet = useMemo(() => new Set(removalStagedIds), [removalStagedIds]);
  const dragStartY = useRef<number | null>(null);
  const dragStartX = useRef<number | null>(null);
  const isDragging = useRef(false);
  const dragAxis = useRef<'none' | 'vertical' | 'horizontal'>('none');
  const sheetRef = useRef<HTMLDivElement>(null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const currentScrollRef = useRef<HTMLDivElement>(null);
  const pendingNav = useRef<AnalyticsDrillDownItem | null>(null);

  // Current index in siblings
  const currentIdx = useMemo(() => {
    if (!segment || siblings.length < 2) return -1;
    return siblings.findIndex(s => s.id === segment.id);
  }, [segment, siblings]);

  const prevSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx - 1 + siblings.length) % siblings.length] : null;
  const nextSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx + 1) % siblings.length] : null;

  // Current panel data: computed synchronously (blocks render)
  const currentData = useMemo(() =>
    computeData(segment),
    [segment]);

  // Prev/next panel data: deferred to after paint so the current panel
  // shows instantly even for expensive drilldowns (e.g. national-dex type
  // matchup with ~1025 Pokemon). Computed eagerly if already cached (the
  // computation returns immediately from cache), or scheduled via
  // requestAnimationFrame otherwise.
  const [prevData, setPrevData] = useState<ReturnType<typeof computeDrillDownData>>(null);
  const [nextData, setNextData] = useState<ReturnType<typeof computeDrillDownData>>(null);

  useEffect(() => {
    // Run after the current panel paints, not inside the interaction that
    // opened it — the neighbours are off-screen until the user swipes. The
    // effect body itself runs before paint, so the work is scheduled on the
    // next frame and its state update is marked non-urgent.
    const id = requestAnimationFrame(() => {
      const prev = prevSibling ? computeData(prevSibling) : null;
      const next = nextSibling ? computeData(nextSibling) : null;
      startTransition(() => {
        setPrevData(prev);
        setNextData(next);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [prevSibling, nextSibling]);

  const bstOverrides = spriteOverrides;

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
      target.onSelect();
      setSwipeX(0);
      setIsAnimating(false);
    });
  }, []);

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

  const commitSwipe = useCallback((targetSibling: AnalyticsDrillDownItem, direction: number) => {
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

  const sheetHeight = `calc(100dvh - ${topGap}px)`;

  const currentTranslateY = peek
    ? `calc(100dvh - ${topGap}px - ${PEEK_HEIGHT}px + ${Math.max(dragY, -(PEEK_HEIGHT))}px)`
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
              key={prevSibling ? prevSibling.id : 'empty-prev'}
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
                  prevShape={siblings.length >= 3 ? getSegmentShape(siblings[(currentIdx - 2 + siblings.length) % siblings.length]) : undefined}
                  nextShape={getSegmentShape(segment!)}
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
              key={segment ? segment.id : 'empty-current'}
              className="h-full flex-1 min-w-0"
              style={{ clipPath: 'inset(-100px 0 0 0)' }}
              onTouchStart={touchStart}
              onTouchMove={handleContentTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              <CardPanel
                data={currentData}
                panelAttributes={panelAttributes}
                assignedIds={assignedIds}
                prevLabel={prevSibling ? getSegmentLabel(prevSibling) : undefined}
                nextLabel={nextSibling ? getSegmentLabel(nextSibling) : undefined}
                prevShape={prevSibling ? getSegmentShape(prevSibling) : undefined}
                nextShape={nextSibling ? getSegmentShape(nextSibling) : undefined}
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
              key={nextSibling ? nextSibling.id : 'empty-next'}
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
                  prevShape={getSegmentShape(segment!)}
                  nextShape={siblings.length >= 3 ? getSegmentShape(siblings[(currentIdx + 2) % siblings.length]) : undefined}
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
export function AnalyticsDrillDownPanel({ panelAttributes, segment, siblings, assignedIds, closeDrillDown, spriteOverrides, removalStagedIds = [], handleToggleRemoval, handleConfirmRemoval }: AnalyticsDrillDownProps) {
  const currentIdx = useMemo(() => {
    if (!segment || siblings.length < 2) return -1;
    return siblings.findIndex(s => s.id === segment.id);
  }, [segment, siblings]);
  const prevSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx - 1 + siblings.length) % siblings.length] : null;
  const nextSibling = siblings.length >= 2 && currentIdx >= 0
    ? siblings[(currentIdx + 1) % siblings.length] : null;
  const currentData = useMemo(() => computeData(segment), [segment]);
  const desktopBstOverrides = spriteOverrides;
  const emptySet = useMemo(() => new Set<number>(), []);
  const noOp = useCallback(() => {}, []);

  const removalStagedSet = useMemo(() => new Set(removalStagedIds), [removalStagedIds]);

  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset staged removals when navigating to a different segment
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [segment]);

  if (!currentData) return null;

  return (
    <div {...panelAttributes} className="relative flex flex-col h-full bg-background w-full">
      {/* Header */}
      <div className="shrink-0 border-b">
        <div className="flex items-center justify-between px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            {currentData.icon && (
              <img src={currentData.icon} alt="" className="w-4 h-4 shrink-0" />
            )}
            {currentData.headerContent}
            {currentData.shape && (
              <ShapeIconCircle shape={currentData.shape} />
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
                onClick={() => prevSibling.onSelect()}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
                <span className="flex flex-col items-center min-w-0 leading-tight">
                  <span className="truncate max-w-[100px]">{getSegmentLabel(prevSibling)}</span>
                  {getSegmentShape(prevSibling) && <ShapeIconCircle shape={getSegmentShape(prevSibling)!} className="mt-0.5" />}
                </span>
              </button>
            ) : <div />}
            {nextSibling ? (
              <button type="button"
                onClick={() => nextSibling.onSelect()}
                className="flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <span className="flex flex-col items-center min-w-0 leading-tight">
                  <span className="truncate max-w-[100px]">{getSegmentLabel(nextSibling)}</span>
                  {getSegmentShape(nextSibling) && <ShapeIconCircle shape={getSegmentShape(nextSibling)!} className="mt-0.5" />}
                </span>
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
          {currentData.emptyContent}
          {currentData.sections.map((section) => (
            <div key={section.sectionId} {...section.attributes}>
              <div className="sticky top-0 z-20 bg-background text-[0.625rem] font-semibold text-muted-foreground uppercase tracking-wide py-[3px] px-1 mt-1 border-b">
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
                  standaloneTiles={currentData.standaloneTiles}
                  cols={6}
                  variant="analytics"
                  showGenBadges={currentData.showGenBadges}
                  showShapeBadges={currentData.showShapeBadges}
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

/** Dex keeps its store and removal workflow; both tools use the same views. */
function useDexDrillDown(): AnalyticsDrillDownProps {
  const sections = usePokedexStore(s => s.sections);
  const segment = usePokedexStore(s => s.drillDownSegment);
  const siblings = usePokedexStore(s => s.drillDownSiblings);
  const excludeSpecial = usePokedexStore(s => s.drillDownExcludeSpecial);
  const dexId = usePokedexStore(s => s.drillDownDexId);
  const newOnly = usePokedexStore(s => s.drillDownNewOnly);
  const navigateDrillDown = usePokedexStore(s => s.navigateDrillDown);
  const closeDrillDown = usePokedexStore(s => s.closeDrillDown);
  const expandDrillDown = usePokedexStore(s => s.expandDrillDown);
  const peek = usePokedexStore(s => s.drillDownPeek);
  const removeEvoLine = usePokedexStore(s => s.removeEvoLine);
  const [removalStagedIds, setRemovalStagedIds] = useState<number[]>([]);
  const assignedIds = useMemo(() => new Set(Object.values(sections).flat()), [sections]);
  const items = useMemo(() => {
    const entry = (item: DrillDownSegment): AnalyticsDrillDownItem => ({
      id: JSON.stringify(item),
      label: item.kind === 'type' || item.kind === 'typeMatchup' ? typeLabel(item.type as TypeName)
        : item.kind === 'shape' ? shapeLabel(item.shape as ShapeName)
        : item.kind === 'generation' ? `Gen ${item.generation}`
        : item.kind === 'evoLevel' ? `Lv ${item.binStart}–${item.binEnd - 1}`
        : item.kind === 'bst' ? `${item.binStart}–${item.binEnd - 1}` : '',
      shape: item.kind === 'shape' ? item.shape as ShapeName : undefined,
      getData: () => computeDrillDownData(item, sections, excludeSpecial, dexId, newOnly),
      onSelect: () => navigateDrillDown(item),
    });
    return { segment: segment ? entry(segment) : null, siblings: siblings.map(entry) };
  }, [segment, siblings, sections, excludeSpecial, dexId, newOnly, navigateDrillDown]);
  useEffect(() => { setRemovalStagedIds([]); }, [segment]);
  const handleToggleRemoval = useCallback((memberIds: number[]) => {
    setRemovalStagedIds(prev => {
      const prevSet = new Set(prev);
      if (memberIds.every(id => prevSet.has(id))) return prev.filter(id => !memberIds.includes(id));
      return [...prev, ...memberIds.filter(id => !prevSet.has(id))];
    });
  }, []);
  const handleConfirmRemoval = useCallback(() => {
    for (const id of new Set(removalStagedIds)) {
      for (const [sectionId, ids] of Object.entries(sections)) {
        if (ids.includes(id)) { removeEvoLine(sectionId, id); break; }
      }
    }
    setRemovalStagedIds([]);
  }, [removalStagedIds, sections, removeEvoLine]);
  return { ...items, assignedIds, closeDrillDown, expandDrillDown, peek, removalStagedIds, handleToggleRemoval, handleConfirmRemoval,
    spriteOverrides: segment?.kind === 'bst' ? BST_SPRITE_OVERRIDES : undefined };
}
export function DrillDownSheet({ topGap }: { topGap: number }) {
  return <AnalyticsDrillDownSheet {...useDexDrillDown()} topGap={topGap} />;
}
export function DrillDownPanel() {
  return <AnalyticsDrillDownPanel {...useDexDrillDown()} />;
}
