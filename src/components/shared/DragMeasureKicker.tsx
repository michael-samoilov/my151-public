import { useDndContext, useDndMonitor } from '@dnd-kit/core';

/**
 * Forces dnd-kit to re-measure every droppable rect on the animation
 * frame after drag starts.
 *
 * The bug this fixes: dnd-kit caches droppable rects lazily and only
 * re-measures when a dependency changes (primarily pointer translate)
 * or when its ResizeObserver fires — but the ResizeObserver is
 * disabled unless a drag is active (`disabled: !active` in
 * useDroppable). So any layout change that happens after mount but
 * before the first drag (fonts loading, sprite images loading, a
 * deferred section collapse, etc.) goes unnoticed: the visible DOM
 * reflects the new positions, but dnd-kit's droppableRects cache is
 * frozen at its initial measurement. The FIRST drag hit-tests
 * against those stale rects, so the snap indicator disagrees with
 * the visible tiles by the delta of all the layout shifts since
 * mount. Once the user moves their finger (translate changes) or a
 * resize fires, rects refresh and subsequent drags behave.
 *
 * Calling measureDroppableContainers() via two nested RAFs at
 * drag-start yields first to React commit, then to browser layout,
 * so getBoundingClientRect reads the settled rect. Must be rendered
 * inside a DndContext.
 */
// platform: dnd-kit caches droppable rects and observes resizes only during a drag, so layout shifts before the first drag leave stale rects.
// platform: Two nested animation frames yield to the React commit and then to browser layout, so the re-measure reads settled rects.
export function DragMeasureKicker() {
  const { measureDroppableContainers } = useDndContext();

  useDndMonitor({
    onDragStart() {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          measureDroppableContainers([]);
        });
      });
    },
  });

  return null;
}
