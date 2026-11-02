import { useMemo } from 'react';
import type { Announcements, ScreenReaderInstructions, UniqueIdentifier } from '@dnd-kit/core';
import { useT } from '@/i18n';

// platform: dnd-kit's default screen reader instructions and drag announcements are English, whatever the page language.
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
