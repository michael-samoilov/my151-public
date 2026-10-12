// Builds public/404.html from src/: the head, the shared CSS, the MissingNo.
// sprite and the pixel font are inlined, so the page needs no other file and
// works from any path. Run: node docs/design/404-page/build.mjs
//
// The other scripts here regenerate the inputs and need packages the app does
// not install (run them with a temporary `npm i subset-font opentype.js wawoff2`):
//   build-sprite.mjs <dir>  writes missingno*.png from a fixed seed (sprite.mjs).
//   build-font.mjs <in.woff2> <out.woff2> <text>
//                     subsets Press Start 2P to the text (printable ASCII and "é") and
//                     renames it Pixel151, as the SIL Open Font License asks of a
//                     modified version. The licence ships at
//                     public/licenses/press-start-2p-OFL.txt.
import fs from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const src = (f) => fs.readFileSync(`${here}src/${f}`);
const b64 = (f) => src(f).toString('base64');
const vars = { FONT: b64('pixel151.woff2'), MS: b64('missingno.png'), MS_RED: b64('missingno-red.png'), MS_CYAN: b64('missingno-cyan.png') };
const MS = '<div class="ms" role="img" aria-label="MissingNo."><i></i><i class="r"></i><i class="c"></i><i class="b1"></i><i class="b2"></i></div>';

const html = src('page.html').toString()
  .replace('{{HEAD}}', src('head.html').toString())
  .replace('{{COMMON_CSS}}', src('common.css').toString())
  .replaceAll('{{MS_ELEMENT}}', MS)
  .replace(/\{\{(\w+)\}\}/g, (m, k) => vars[k] ?? m);
const left = html.match(/\{\{\w+\}\}/);
if (left) throw new Error(`unreplaced ${left[0]}`);
const out = new URL('../../../public/404.html', import.meta.url).pathname;
fs.writeFileSync(out, html);
console.log(out, html.length, 'B');
