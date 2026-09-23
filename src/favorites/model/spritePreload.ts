import { allPickerMons } from './catalog';

const decoded = new Map<string, HTMLImageElement>();
let started = false;

export function prewarmPickerSprites(): void {
  if (started || typeof Image === 'undefined') return;
  started = true;
  const urls = [...new Set(allPickerMons().map((mon) => mon.sprite))];
  let next = 0;
  let active = 0;
  const pump = () => {
    while (active < 12 && next < urls.length) {
      const url = urls[next++];
      const img = new Image();
      img.decoding = 'async';
      img.src = url;
      active += 1;
      img.decode().then(() => decoded.set(url, img)).catch(() => {}).finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  pump();
}
