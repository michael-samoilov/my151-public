type BoxSize = { inlineSize: number; blockSize: number };

const pixels = (value: string) => Number.parseFloat(value) || 0;

function measure(target: Element): ResizeObserverEntry {
  const border = target.getBoundingClientRect();
  const style = getComputedStyle(target);
  const left = pixels(style.paddingLeft) + pixels(style.borderLeftWidth);
  const top = pixels(style.paddingTop) + pixels(style.borderTopWidth);
  const width = Math.max(0, border.width - left - pixels(style.paddingRight) - pixels(style.borderRightWidth));
  const height = Math.max(0, border.height - top - pixels(style.paddingBottom) - pixels(style.borderBottomWidth));
  const contentBox: BoxSize = { inlineSize: width, blockSize: height };
  const dpr = window.devicePixelRatio || 1;
  return {
    target,
    contentRect: new DOMRect(pixels(style.paddingLeft), pixels(style.paddingTop), width, height),
    borderBoxSize: [{ inlineSize: border.width, blockSize: border.height }],
    contentBoxSize: [contentBox],
    devicePixelContentBoxSize: [{ inlineSize: width * dpr, blockSize: height * dpr }],
  };
}

export class WindowResizeObserver implements ResizeObserver {
  private readonly callback: ResizeObserverCallback;
  private readonly lastSize = new Map<Element, string>();
  private readonly pending = new Set<Element>();
  private frame = 0;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }

  observe(target: Element): void {
    if (this.lastSize.size === 0) window.addEventListener('resize', this.onResize);
    this.lastSize.set(target, '');
    this.schedule([target]);
  }

  unobserve(target: Element): void {
    this.lastSize.delete(target);
    this.pending.delete(target);
    if (this.lastSize.size === 0) this.stop();
  }

  disconnect(): void {
    this.lastSize.clear();
    this.pending.clear();
    this.stop();
  }

  private stop() {
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly onResize = () => this.schedule(this.lastSize.keys());

  private schedule(targets: Iterable<Element>) {
    for (const target of targets) this.pending.add(target);
    if (this.frame === 0) this.frame = requestAnimationFrame(this.flush);
  }

  private readonly flush = () => {
    this.frame = 0;
    const changed: ResizeObserverEntry[] = [];
    for (const target of this.pending) {
      const entry = measure(target);
      const size = `${entry.borderBoxSize[0].inlineSize}x${entry.borderBoxSize[0].blockSize}`;
      if (this.lastSize.get(target) === size) continue;
      this.lastSize.set(target, size);
      changed.push(entry);
    }
    this.pending.clear();
    if (changed.length > 0) this.callback(changed, this);
  };
}

// platform: Some Safari builds report a Safari 16 user agent but ship no ResizeObserver, and every component that measures itself throws without it.
if (typeof window !== 'undefined' && typeof window.ResizeObserver === 'undefined') {
  window.ResizeObserver = WindowResizeObserver;
}
