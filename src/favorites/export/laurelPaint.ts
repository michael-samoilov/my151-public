export const FAVORITE_ORNAMENTS = {
  leaf: '/sprites/export/shiny-leaf.png',
  crown: '/sprites/export/leaf-crown.png',
  crownX: 1007, crownY: 681, crownWidth: 93, crownHeight: 54,
  halfHeight: 98, depth: 32.5, centerY: 840, midpointX: 819.5,
  mirrorAxisX: 1053, stations: 11, visibleLeaves: 10, lowerTail: 12,
  stem: '#8c6b31',
} as const;

function rotatedLeaf(source: ImageData, angle: number): HTMLCanvasElement {
  const cos = Math.cos(angle), sin = Math.sin(angle);
  const dimension = Math.ceil(30 * (Math.abs(cos) + Math.abs(sin)));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = dimension;
  const ctx = canvas.getContext('2d')!;
  const target = ctx.createImageData(dimension, dimension);
  for (let y = 0; y < dimension; y++) for (let x = 0; x < dimension; x++) {
    const dx = x + 0.5 - dimension / 2, dy = y + 0.5 - dimension / 2;
    const sx = Math.floor((cos * dx + sin * dy) / 2 + source.width / 2);
    const sy = Math.floor((-sin * dx + cos * dy) / 2 + source.height / 2);
    if (sx < 0 || sy < 0 || sx >= source.width || sy >= source.height) continue;
    const from = (sy * source.width + source.width - 1 - sx) * 4;
    target.data.set(source.data.subarray(from, from + 4), (y * dimension + x) * 4);
  }
  ctx.putImageData(target, 0, 0);
  return canvas;
}

export function drawFavoriteLaurels(ctx: CanvasRenderingContext2D, leaf: HTMLImageElement): void {
  const L = FAVORITE_ORNAMENTS;
  const radius = (L.halfHeight ** 2 + L.depth ** 2) / (2 * L.depth);
  const leftCenter = L.midpointX + radius;
  const extent = Math.asin(L.halfHeight / radius);
  const pitch = 2 * radius * extent / (L.stations - 1);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = leaf.naturalWidth; sourceCanvas.height = leaf.naturalHeight;
  const sourceCtx = sourceCanvas.getContext('2d')!;
  sourceCtx.drawImage(leaf, 0, 0);
  const source = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const stemAngle = Math.atan2(-13, -12);
  ctx.save();
  ctx.strokeStyle = L.stem;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  const lower = extent + L.lowerTail / radius;
  ctx.beginPath();
  ctx.arc(leftCenter, L.centerY, radius, Math.PI - lower, Math.PI + extent);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(2 * L.mirrorAxisX - leftCenter, L.centerY, radius, -extent, lower);
  ctx.stroke();
  ctx.imageSmoothingEnabled = false;
  for (let index = 0; index < L.visibleLeaves; index++) {
    const phi = -extent + index * pitch / radius;
    const tangent = Math.atan2(-Math.cos(phi), -Math.sin(phi));
    const sprite = rotatedLeaf(source, tangent - stemAngle);
    const cx = leftCenter - radius * Math.cos(phi), cy = L.centerY + radius * Math.sin(phi);
    const x = Math.round(cx - sprite.width / 2), y = Math.round(cy - sprite.height / 2);
    ctx.drawImage(sprite, x, y);
    ctx.save();
    ctx.translate(2 * L.mirrorAxisX - x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(sprite, 0, 0);
    ctx.restore();
  }
  ctx.restore();
}

export function drawFavoriteCrown(ctx: CanvasRenderingContext2D, crown: HTMLImageElement,
  placement: { x: number; y: number; width: number; height: number } = {
    x: FAVORITE_ORNAMENTS.crownX, y: FAVORITE_ORNAMENTS.crownY,
    width: FAVORITE_ORNAMENTS.crownWidth, height: FAVORITE_ORNAMENTS.crownHeight,
  }): void {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(crown, placement.x, placement.y, placement.width, placement.height);
  ctx.restore();
}
