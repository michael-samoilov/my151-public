import { getUnzoomedViewportWidth } from './viewport';

function computeFontSize(): number {
  const width = getUnzoomedViewportWidth();
  const fluid = 13 + 0.7 * (width / 100);
  return Math.max(16, Math.min(fluid, 20));
}

let rafHandle: number | null = null;
let lastFontSize = '';

function apply() {
  if (rafHandle !== null) return;
  rafHandle = requestAnimationFrame(() => {
    rafHandle = null;
    const next = `${computeFontSize()}px`;
    if (next !== lastFontSize) {
      lastFontSize = next;
      document.documentElement.style.fontSize = next;
    }
  });
}

export function getAppliedRootFontSizePx(): number {
  if (lastFontSize) return parseFloat(lastFontSize) || 16;
  if (typeof document === 'undefined') return 16;
  try {
    return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
  } catch {
    return 16;
  }
}

export function installLayoutFontSize() {
  if (typeof window === 'undefined') return;
  apply();
  window.addEventListener('resize', apply);
  // platform: visualViewport events fire on every pinch frame, and the layout viewport does not change under a pinch.
  const watchDpr = () => {
    const mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    mq.addEventListener('change', () => { apply(); watchDpr(); }, { once: true });
  };
  watchDpr();
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(apply);
    ro.observe(document.documentElement);
  }
}
