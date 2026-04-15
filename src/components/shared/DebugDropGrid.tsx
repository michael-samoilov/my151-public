import { useDndContext } from '@dnd-kit/core';

/**
 * Debug visualization of the invisible droppable hit grid. Renders a
 * fixed-position outline on every registered droppable using the rects
 * dnd-kit is actually using for collision detection — so if the grid
 * appears visually misaligned with the real tiles, the snap indicator
 * will too, and you've found the bug.
 *
 * The currently-targeted droppable (event.over) is highlighted in
 * green; every other droppable gets a thin blue outline.
 *
 * Enable by appending `?debugGrid=1` to the URL. Disabled otherwise —
 * no rendering cost for normal users.
 *
 * Must be rendered inside a DndContext so the useDndContext() hook has
 * access to droppableRects / over / active.
 */
export function DebugDropGrid() {
  const { droppableRects, over, active } = useDndContext();

  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  if (params.get('debugGrid') !== '1') return null;
  if (!active) return null;

  const rects: Array<{ id: string; rect: { left: number; top: number; width: number; height: number } }> = [];
  droppableRects.forEach((rect, id) => {
    rects.push({ id: String(id), rect });
  });

  const overId = over?.id != null ? String(over.id) : null;

  return (
    <>
      {rects.map(({ id, rect }) => {
        const isOver = id === overId;
        return (
          <div
            key={id}
            className="fixed pointer-events-none z-[9998]"
            style={{
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              border: isOver ? '2px solid #22c55e' : '1px solid rgba(59,130,246,0.7)',
              background: isOver ? 'rgba(34,197,94,0.18)' : 'rgba(59,130,246,0.06)',
              boxSizing: 'border-box',
            }}
            aria-hidden
          >
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                fontSize: 8,
                lineHeight: '10px',
                padding: '1px 2px',
                background: isOver ? '#22c55e' : 'rgba(59,130,246,0.7)',
                color: 'white',
                fontFamily: 'monospace',
                whiteSpace: 'nowrap',
                maxWidth: rect.width,
                overflow: 'hidden',
              }}
            >
              {id}
            </div>
          </div>
        );
      })}
    </>
  );
}
