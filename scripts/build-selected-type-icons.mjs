import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const output = 'public/sprites/types/vector';
const candidates = JSON.parse(execFileSync('python', ['scripts/type-icons/prepare.py'], { encoding: 'utf8' }));
const colors = Object.fromEntries([...readFileSync('src/data/type-colors.ts', 'utf8').matchAll(/(\w+): '(#[\dA-Fa-f]+)'/g)].map((m) => [m[1], m[2]]));
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'], ...(process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : {}) });
const registry = {};
const geometry = {};
mkdirSync(output, { recursive: true });
try {
  const page = await browser.newPage();
  for (const { name, source, mirroredHalf, body } of candidates) {
    await page.setContent(`<svg xmlns="http://www.w3.org/2000/svg">${body}</svg>`);
    const bounds = await page.locator('#source-glyph').evaluate((el) => {
      const { x, y, width, height } = el.getBBox();
      return { x, y, width, height };
    });
    const { x, y, width, height } = bounds;
    const cx = 128;
    const gx = mirroredHalf ? 2 * cx - (x + width) : x;
    const gw = mirroredHalf ? 2 * (x + width - cx) : width;
    const box = `x="${x}" y="${y}" width="${width}" height="${height}"`;
    const paint = `<rect ${box} fill="white" mask="url(#source-mask)"/>`;
    const mask = `<mask id="source-mask" maskUnits="userSpaceOnUse" ${box} style="mask-type:luminance">${body}</mask>`;
    const content = mirroredHalf
      ? `<defs>${mask}<clipPath id="right-half"><rect x="${cx}" y="${y}" width="${x + width - cx}" height="${height}"/></clipPath><g id="right-glyph" clip-path="url(#right-half)">${paint}</g></defs><use href="#right-glyph"/><use href="#right-glyph" transform="translate(${2 * cx} 0) scale(-1 1)"/>`
      : `<defs>${mask}</defs>${paint}`;
    const viewBox = `${gx} ${y} ${gw} ${height}`;
    const notice = source === 'partywhale'
      ? `<!-- Source: partywhale/pokemon-type-icons; selected and modified by my151.\n${readFileSync('scripts/type-icons/sources/partywhale/LICENSE', 'utf8')}-->`
      : '<!-- Source: Elginive/pokemon-type-icons. README grants free use; credit appreciated. -->';
    const glyph = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(gw * 4)}" height="${Math.round(height * 4)}" viewBox="${viewBox}" overflow="hidden">${notice}${content}</svg>`;
    const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="60" height="60" viewBox="0 0 60 60" overflow="hidden">${notice}<rect width="60" height="60" rx="8" fill="${colors[name]}"/><svg x="10" y="10" width="40" height="40" viewBox="${viewBox}" preserveAspectRatio="xMidYMid meet" overflow="hidden">${content}</svg></svg>`;
    const save = (kind, svg) => {
      const hash = createHash('sha256').update(svg).digest('hex').slice(0, 12);
      const file = `${name}-${kind}.${hash}.svg`;
      writeFileSync(`${output}/${file}`, svg + '\n');
      return `/sprites/types/vector/${file}`;
    };
    registry[name] = { source, mirroredHalf, glyph: save('glyph', glyph), icon: save('icon', icon) };
    geometry[name] = { original: bounds, glyph: { x: gx, y, width: gw, height }, mirrorAxis: mirroredHalf ? cx : null };
  }
} finally {
  await browser.close();
}
const module = `import type { TypeName } from '@/types/pokemon';\n\nexport const TYPE_ICONS = ${JSON.stringify(registry, null, 2)} as const satisfies Record<TypeName, {\n  source: 'partywhale' | 'elginive';\n  mirroredHalf: 'right' | null;\n  icon: string;\n  glyph: string;\n}>;\n`;
writeFileSync('src/data/type-icons.ts', module);
writeFileSync('scripts/type-icons/geometry.json', JSON.stringify(geometry, null, 2) + '\n');
console.log('Generated 18 selected SVG glyphs and 18 square icons.');
