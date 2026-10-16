import { useLayoutEffect, useRef, useState } from 'react';

export function useXHeightAlignment(enabled: boolean) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const title = titleRef.current;
    const description = descriptionRef.current;
    if (!enabled || !title || !description) return;

    const context = document.createElement('canvas').getContext('2d');
    if (!context) return;
    let active = true;
    const xHeight = (element: HTMLElement) => {
      const font = getComputedStyle(element);
      context.font = `${font.fontStyle} ${font.fontWeight} ${font.fontSize} ${font.fontFamily}`;
      return context.measureText('x').actualBoundingBoxAscent;
    };
    const measure = () => {
      if (active) setOffset(xHeight(description) - xHeight(title));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(title);
    observer.observe(description);
    document.fonts.addEventListener('loadingdone', measure);
    void document.fonts.ready.then(measure);
    measure();

    return () => {
      active = false;
      observer.disconnect();
      document.fonts.removeEventListener('loadingdone', measure);
    };
  }, [enabled]);

  return { titleRef, descriptionRef, offset: enabled ? offset : 0 };
}
