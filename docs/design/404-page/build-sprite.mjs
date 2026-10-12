// Writes the MissingNo. sprite PNGs into src/: the sprite itself, and two
// one-colour copies of its dark pixels for the RGB split.
import { generate, setDark } from './sprite.mjs';
import { encodePng } from './png.mjs';
import fs from 'fs';
const out = process.argv[2];
setDark(0.45);
const px = generate(1);
const T = [0, 0, 0, 0];
// Index 0 = transparent (outside the ┘). Shades 0..3 -> indices 1..4.
const full = px.map((row) => row.map((v) => (v < 0 ? 0 : v + 1)));
fs.writeFileSync(`${out}/missingno.png`, encodePng(full, [T, [255, 255, 255], [200, 200, 204], [110, 110, 110], [10, 10, 10]]));
const ghost = (rgb) => encodePng(px.map((row) => row.map((v) => (v === 3 ? 1 : 0))), [T, rgb]);
fs.writeFileSync(`${out}/missingno-red.png`, ghost([220, 38, 38]));
fs.writeFileSync(`${out}/missingno-cyan.png`, ghost([14, 165, 233]));
for (const f of ['missingno.png', 'missingno-red.png', 'missingno-cyan.png']) console.log(f, fs.statSync(`${out}/${f}`).size, 'B');
