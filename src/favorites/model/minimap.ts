export function minimapViewportX(scrollLeft: number, scale: number, mapWidth: number, viewportWidth: number): number {
  return Math.max(-8, Math.min(mapWidth - viewportWidth + 8, scrollLeft * scale));
}
