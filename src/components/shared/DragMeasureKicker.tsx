import { useDndContext, useDndMonitor } from '@dnd-kit/core';

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
