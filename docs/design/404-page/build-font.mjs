// Subsets Press Start 2P (OFL-1.1, Reserved Font Name "Press Start 2P") to the
// characters the 404 page draws, and renames it, as the OFL requires of a
// modified version that would otherwise carry a reserved name.
import fs from 'fs';
import subsetFont from 'subset-font';
import opentype from 'opentype.js';
import { compress, decompress } from 'wawoff2';
const [srcWoff2, outWoff2, text] = process.argv.slice(2);
const ttf = await decompress(fs.readFileSync(srcWoff2));
const sub = await subsetFont(Buffer.from(ttf), text, { targetFormat: 'truetype' });
const font = opentype.parse(sub.buffer.slice(sub.byteOffset, sub.byteOffset + sub.byteLength));
const NAME = 'Pixel151';
const keep = font.names.windows ?? font.names;
const names = {
  copyright: keep.copyright,
  fontFamily: { en: NAME },
  fontSubfamily: { en: 'Regular' },
  uniqueID: { en: `${NAME}-Regular` },
  fullName: { en: `${NAME} Regular` },
  version: keep.version,
  postScriptName: { en: `${NAME}-Regular` },
  description: { en: 'A subset of Press Start 2P, renamed as the SIL Open Font License 1.1 requires of a modified version.' },
  license: { en: 'This Font Software is licensed under the SIL Open Font License, Version 1.1.' },
  licenseURL: keep.licenseURL,
};
font.names = { windows: names, macintosh: names, unicode: names };
const otf = Buffer.from(font.toArrayBuffer());
const woff2 = await compress(otf);
fs.writeFileSync(outWoff2, woff2);
console.log('glyphs', font.glyphs.length, 'otf', otf.length, 'woff2', woff2.length, 'base64', Buffer.from(woff2).toString('base64').length);
