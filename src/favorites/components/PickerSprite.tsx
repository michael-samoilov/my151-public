import type { ImgHTMLAttributes } from 'react';
import { usePickerSprite } from '../model/spritePreload';

/**
 * A picker sprite's <img>. When the sprite's pack arrives, only this element
 * renders again, not the selector tile around it: on a phone that is still
 * starting, re-rendering every tile of a selector cost about 40 ms.
 */
export function PickerSprite({ sprite, alt, ...img }: { sprite: string; alt: string } & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt'>) {
  return <img src={usePickerSprite(sprite)} alt={alt} {...img} />;
}
