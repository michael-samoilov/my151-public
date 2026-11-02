import fs from 'node:fs';

const here = new URL('.', import.meta.url).pathname;
const src = (f) => fs.readFileSync(`${here}src/${f}`);
const b64 = (f) => src(f).toString('base64');
const vars = { FONT: b64('pixel151.woff2'), MS: b64('missingno.png') };
const MS = '<div class="ms" role="img" aria-label="MissingNo."><i></i><i class="b1"></i><i class="b2"></i></div>';

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
