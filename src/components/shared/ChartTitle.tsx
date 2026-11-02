import { useLayoutEffect, useRef, useState } from 'react';
import { localeUppercase } from '@/i18n';
import { MAX_LABEL_STRETCH, measureLabelWidth } from '@/lib/sectionOutlines';

export function ChartTitle({ text, as: Heading = 'h2', className = 'mb-1' }: { text: string; as?: 'h2' | 'h3'; className?: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const [stretch, setStretch] = useState(1);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const width = measureLabelWidth(localeUppercase(text), parseFloat(getComputedStyle(el).fontSize) || 14);
      if (width > 0 && el.clientWidth > 0) setStretch(Math.min(MAX_LABEL_STRETCH, el.clientWidth / width));
    };
    let active = true;
    measure();
    void document.fonts.ready.then(() => { if (active) measure(); });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { active = false; observer.disconnect(); };
  }, [text]);
  return <Heading ref={ref} className={`text-sm overflow-hidden ${className}`}><span className="inline-block font-black uppercase leading-none whitespace-nowrap origin-left" style={{ transform: `scaleX(${stretch})` }}>{text}</span></Heading>;
}
