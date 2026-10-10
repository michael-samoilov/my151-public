import { t } from '@/i18n';
import { slotKind } from './model/constants';

/**
 * A league slot's name in the active locale: "Gym 3", "Elite Four 2".
 *
 * Kept out of `model/constants`, which scripts import outside Vite, where the
 * catalogs do not load. It reads the locale when it is called, so a component
 * that shows one subscribes to the locale itself.
 */
export function slotLabel(slotIndex: number): string {
  const kind = slotKind(slotIndex);
  if (kind === 'gym') return t('league.slotName.gym', { n: slotIndex + 1 });
  if (kind === 'elite') return t('league.slotName.elite', { n: slotIndex - 7 });
  if (kind === 'champion') return t('league.slotName.champion');
  return t('league.slotName.boss');
}
