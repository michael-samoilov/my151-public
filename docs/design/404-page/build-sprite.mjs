// Writes the MissingNo. sprite PNG into src/, in the official sprite's three
// colours (sampled from its art) plus white.
import { generate, setDark } from './sprite.mjs';
import { encodePng } from './png.mjs';
import fs from 'fs';
const out = process.argv[2];
setDark(0.45);
const px = generate(1);
const TRANSPARENT = [0, 0, 0, 0];
// Index 0 = transparent (outside the ┘). Shades 0..3 -> indices 1..4.
const paletteIndices = px.map((row) => row.map((v) => (v < 0 ? 0 : v + 1)));
fs.writeFileSync(`${out}/missingno.png`, encodePng(paletteIndices, [TRANSPARENT, [255, 255, 255], [225, 177, 141], [123, 111, 147], [26, 20, 20]]));
console.log('missingno.png', fs.statSync(`${out}/missingno.png`).size, 'B');
