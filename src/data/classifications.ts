import type { ColorName, EggGroupName } from '@/types/pokemon';
import { COLOR_NAMES, EGG_GROUP_NAMES } from '@/types/pokemon';

export const COLOR_ORDER: readonly ColorName[] = COLOR_NAMES;

export const COLOR_SWATCHES: Record<ColorName, string> = {
  black: '#33363b',
  blue: '#4a86d8',
  brown: '#a5673f',
  gray: '#9299a1',
  green: '#5fbb54',
  pink: '#f19bc0',
  purple: '#9a5bbd',
  red: '#e0574f',
  white: '#eceef0',
  yellow: '#f7d94c',
};

export function colorTextOn(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#1a1a1a' : '#ffffff';
}

export function colorRingOn(hex: string): string {
  return colorTextOn(hex) === '#1a1a1a' ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.4)';
}

export const EGG_GROUP_ORDER: readonly EggGroupName[] = EGG_GROUP_NAMES;

