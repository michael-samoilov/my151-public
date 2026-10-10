import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const output = 'public/sprites/types/vector';
const candidates = JSON.parse(execFileSync(process.env.TYPE_ICON_PYTHON || 'python', ['scripts/type-icons/compound.py'], { encoding: 'utf8' }));
const colors = Object.fromEntries([...readFileSync('src/data/type-colors.ts', 'utf8').matchAll(/(\w+): '(#[\dA-Fa-f]+)'/g)].map((m) => [m[1], m[2]]));
const calibration = JSON.parse(readFileSync('scripts/type-icons/game-calibration.json', 'utf8'));
const frame = calibration.glyphFrame;
if (calibration.schemaVersion !== 1 || frame.width !== frame.height) throw new Error('Unsupported game calibration frame');
if (Object.keys(calibration.types).length !== candidates.length) throw new Error('Game calibration must cover every selected type');
for (const { name } of candidates) {
  const reference = calibration.types[name];
  if (!reference) throw new Error(`Missing game calibration for ${name}`);
  const digest = createHash('sha256').update(readFileSync(reference.referencePath)).digest('hex');
  if (digest !== reference.referenceSha256) throw new Error(`Game reference changed for ${name}; remeasure before generating`);
}
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}) });
const registry = {};
const geometry = {};
mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage();
  for (const { name, source, mirroredHalf, body, sourceBody, bounds: ink } of candidates) {
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${sourceBody}</svg>`);
    const bounds = await page.locator('#source-glyph').evaluate((el) => {
      const { x, y, width, height } = el.getBBox();
      return { x, y, width, height };
    });
    const reference = calibration.types[name];
    if (!ink || ![ink.x, ink.y, ink.width, ink.height].every(Number.isFinite) || ink.width <= 0 || ink.height <= 0) {
      throw new Error(`Invalid vector ink bounds for ${name}`);
    }
    if (reference.targetMaxExtent !== Math.max(reference.bounds.width, reference.bounds.height)) {
      throw new Error(`Inconsistent game calibration extent for ${name}`);
    }
    const scale = reference.targetMaxExtent / Math.max(ink.width, ink.height);
    const gameCenter = { x: mirroredHalf ? calibration.iconFrame.width / 2 : reference.center.x, y: reference.center.y };
    const tx = gameCenter.x - frame.x - (ink.x + ink.width / 2) * scale;
    const ty = gameCenter.y - frame.y - (ink.y + ink.height / 2) * scale;
    const calibratedInk = { x: ink.x * scale + tx, y: ink.y * scale + ty, width: ink.width * scale, height: ink.height * scale };
    if (!Object.values(calibratedInk).every(Number.isFinite) || calibratedInk.x < 0 || calibratedInk.y < 0 ||
        calibratedInk.x + calibratedInk.width > frame.width || calibratedInk.y + calibratedInk.height > frame.height) {
      throw new Error(`Calibrated ${name} artwork extends outside the shared glyph frame`);
    }
    // Every glyph shares the same game frame. Its transparent padding carries
    // relative size and optical placement into badges, masks, and exports.
    const content = `<g transform="translate(${tx} ${ty}) scale(${scale})">${body}</g>`;
    const viewBox = `0 0 ${frame.width} ${frame.height}`;
    const notice = source === 'partywhale'
      ? `<!-- Source: partywhale/pokemon-type-icons; selected and modified by my151.\n${readFileSync('scripts/type-icons/sources/partywhale/LICENSE', 'utf8')}-->`
      : '<!-- Source: Elginive/pokemon-type-icons. README grants free use; credit appreciated. -->';
    const glyph = `<svg xmlns="http://www.w3.org/2000/svg" width="${frame.width * 4}" height="${frame.height * 4}" viewBox="${viewBox}" overflow="hidden">${notice}${content}</svg>`;
    // Use identical calibrated content inside the native 60-unit game frame.
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60" overflow="hidden">${notice}<rect width="60" height="60" rx="8" fill="${colors[name]}"/><g transform="translate(${frame.x} ${frame.y})">${content}</g></svg>`;
    const save = (kind, svg) => {
      const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12);
      const file = `${name}-${kind}.${hash}.svg`;
      writeFileSync(`${output}/${file}`, svg + '\n');
      return `/sprites/types/vector/${file}`;
    };
    registry[name] = { source, mirroredHalf, glyph: save('glyph', glyph), icon: save('icon', icon) };
    geometry[name] = {
      original: bounds,
      sourceInk: ink,
      glyph: { x: 0, y: 0, width: frame.width, height: frame.height },
      mirrorAxis: mirroredHalf ? calibration.iconFrame.width / 2 - frame.x : null,
      calibration: { referenceSha256: reference.referenceSha256, gameBounds: reference.bounds, gameCenter, targetMaxExtent: reference.targetMaxExtent, scale, translation: { x: tx, y: ty }, inkBounds: calibratedInk },
    };
  }
} finally {
  await browser.close();
}
const module = `import type { TypeName } from '@/types/pokemon';\n\nexport const TYPE_ICONS = ${JSON.stringify(registry, null, 2)} as const satisfies Record<TypeName, {\n  source: 'partywhale' | 'elginive';\n  mirroredHalf: 'right' | null;\n  icon: string;\n  glyph: string;\n}>;\n`;
writeFileSync('src/data/type-icons.ts', module);
writeFileSync('scripts/type-icons/geometry.json', JSON.stringify(geometry, null, 2) + '\n');
console.log('Generated 18 selected SVG glyphs and 18 square icons.');
