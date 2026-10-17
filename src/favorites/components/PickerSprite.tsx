import type { ImgHTMLAttributes } from 'react';
import { usePickerSprite } from '../model/spritePreload';

export function PickerSprite({ sprite, alt, ...img }: { sprite: string; alt: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  return <img src={usePickerSprite(sprite)} alt={alt} {...img} />;
}
