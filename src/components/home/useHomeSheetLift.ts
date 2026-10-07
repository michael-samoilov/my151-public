import { useLayoutEffect, useRef } from 'react';

/** Keep each floating sheet inside its pocket and clear of preceding copy. */
export function useHomeSheetLift(floated: number | null) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const stage = ref.current;
    if (!stage || floated === null) return;
    const card = stage.closest('.hub-card');
    const panel = card?.querySelector<HTMLElement>('[data-card-panel]');
    const grid = stage.closest('.hub-grid');
    if (!panel || !grid) return;
    let active = true;
    const clearance = (hit: HTMLElement, sheetCard: Element, sheetPanel: HTMLElement) => {
      const bounds = hit.getBoundingClientRect();
      const pocket = sheetPanel.getBoundingClientRect();
      const style = getComputedStyle(hit);
      const width = parseFloat(style.width);
      const height = parseFloat(style.height);
      if (!width || !height) return 0;
      const matrix = new DOMMatrix(style.transform);
      const points = [[-width / 2, -height / 2], [width / 2, -height / 2],
        [width / 2, height / 2], [-width / 2, height / 2]].map(([x, y]) => ({
        x: bounds.x + bounds.width / 2 + matrix.a * x + matrix.c * y,
        y: bounds.y + bounds.height / 2 + matrix.b * x + matrix.d * y,
      }));
      const inset = Math.min(2, pocket.height * 0.015);
      const clipTop = hit.parentElement!.getBoundingClientRect().top;
      let lift = Math.min(bounds.top - clipTop - inset,
        Math.min(points[2].y, points[3].y) - pocket.bottom - inset);

      // Translation along screen Y also moves a tilted side across the rounded
      // corner. Bound that movement against the actual pocket curve.
      const slope = (points[3].x - points[0].x) / (points[3].y - points[0].y);
      const radius = parseFloat(getComputedStyle(sheetPanel).borderBottomLeftRadius);
      if (Math.abs(slope) > 0.0001) {
        for (let d = 0.5; d <= radius; d += 0.5) {
          const y = pocket.bottom - d;
          const curve = radius - Math.sqrt(radius ** 2 - (radius - d) ** 2);
          const x = slope < 0
            ? points[0].x + (y - points[0].y) * slope
            : points[1].x + (y - points[1].y) * slope;
          const room = slope < 0 ? x - pocket.left - curve : pocket.right - curve - x;
          lift = Math.min(lift, room / Math.abs(slope));
        }
      }

      const blockers = [stage.closest('.hub-home')?.querySelector('section'),
        ...grid.querySelectorAll('[data-card-caption]')];
      for (const blocker of blockers) {
        if (!blocker || sheetCard.contains(blocker)) continue;
        const b = blocker.getBoundingClientRect();
        if (b.bottom > pocket.top || Math.min(b.right, bounds.right) <= Math.max(b.left, bounds.left)) continue;
        const room = bounds.top - b.bottom;
        const gutter = Math.min(pocket.height * 0.08, Math.max(0, room) / 4);
        lift = Math.min(lift, room - gutter);
      }
      return Math.max(0, lift);
    };
    const update = () => {
      if (!active) return;
      const pocket = panel.getBoundingClientRect();
      let rearLift = pocket.height * 0.55;
      // Share one rear lift per row. Front sheets move exactly half as far.
      // Short-paper and text clearances constrain the pair together.
      for (const peer of grid.querySelectorAll('.hub-card')) {
        const peerPanel = peer.querySelector<HTMLElement>('[data-card-panel]');
        if (!peerPanel || Math.abs(peerPanel.getBoundingClientRect().top - pocket.top) > 1) continue;
        for (const hit of peer.querySelectorAll<HTMLElement>('[data-hit]')) {
          const front = hit.dataset.shot === '1';
          rearLift = Math.min(rearLift, clearance(hit, peer, peerPanel) * (front ? 2 : 1));
        }
      }
      stage.style.setProperty('--hover-lift', `${rearLift * (floated === 0 ? 1 : 0.5)}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    for (const hit of grid.querySelectorAll('[data-hit]')) observer.observe(hit);
    observer.observe(grid);
    window.addEventListener('resize', update);
    document.fonts.addEventListener('loadingdone', update);
    void document.fonts.ready.then(update);
    return () => {
      active = false;
      observer.disconnect();
      window.removeEventListener('resize', update);
      document.fonts.removeEventListener('loadingdone', update);
    };
  }, [floated]);
  return ref;
}
