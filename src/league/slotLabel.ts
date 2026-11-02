import { t } from '@/i18n';
import { slotKind } from './model/constants';

// platform: The catalogs load only inside Vite, and scripts import `model/constants` outside it, so this function stays out of that module.
export function slotLabel(slotIndex: number): string {
  const kind = slotKind(slotIndex);
  if (kind === 'gym') return t('league.slotName.gym', { n: slotIndex + 1 });
  if (kind === 'elite') return t('league.slotName.elite', { n: slotIndex - 7 });
  if (kind === 'champion') return t('league.slotName.champion');
  return t('league.slotName.boss');
}
