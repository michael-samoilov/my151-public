import { useMemo } from 'react';
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';
import { useT } from '@/i18n';

/**
 * dnd-kit's screen reader text in the active locale, for `DndContext`'s
 * `accessibility` prop.
 *
 * Its defaults are English whatever the page language: the instructions
 * that describe every draggable tile, and the live announcements during a
 * drag. The English catalog values repeat those defaults word for word. The
 * role description each draggable carries is `dnd.roleDescription`, passed
 * to `useDraggable` where the tile is.
 */
export function useDndAccessibility(): {
  announcements: Announcements;
  screenReaderInstructions: ScreenReaderInstructions;
} {
  const t = useT();
  return useMemo(() => {
    const id = (value: UniqueIdentifier) => String(value);
    return {
      screenReaderInstructions: { draggable: t('dnd.instructions') },
      announcements: {
        onDragStart: ({ active }) => t('dnd.pickedUp', { id: id(active.id) }),
        onDragOver: ({ active, over }) => (over
          ? t('dnd.movedOver', { id: id(active.id), over: id(over.id) })
          : t('dnd.notOver', { id: id(active.id) })),
        onDragEnd: ({ active, over }) => (over
          ? t('dnd.droppedOver', { id: id(active.id), over: id(over.id) })
          : t('dnd.dropped', { id: id(active.id) })),
        onDragCancel: ({ active }) => t('dnd.cancelled', { id: id(active.id) }),
      },
    };
  }, [t]);
}
