#!/usr/bin/env python3
"""Rebuild pinned numeral geometry. Requires fonttools 4.61.1."""
import json
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
root = Path(__file__).resolve().parent.parent
font = TTFont(root / 'src/favorites/fonts/noto-sans-bold-roman.ttf')
glyphs = font.getGlyphSet()
scale = 15 / font['head'].unitsPerEm
result = {}
for number, label in enumerate(['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX'], 1):
    names = [font.getBestCmap()[ord(char)] for char in label]
    advances = [font['hmtx'][name][0] * scale for name in names]
    width = sum(advances) - .4 * (len(names) - 1)
    x = 16 - width / 2
    pen = SVGPathPen(glyphs)
    for name, advance in zip(names, advances):
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, 21.5)))
        x += advance - .4
    result[str(number)] = pen.getCommands()
(root / 'src/favorites/fonts/roman-disc-paths.json').write_text(json.dumps(result, indent=2) + '\n')

# Single glyphs in font units, y down from the baseline, for gen badges that
# set the numeral at any size beside text.
upm = font['head'].unitsPerEm
letters = {}
for char in 'IVX':
    name = font.getBestCmap()[ord(char)]
    pen = SVGPathPen(glyphs)
    glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, 0, 0)))
    letters[char] = {'advance': font['hmtx'][name][0], 'd': pen.getCommands()}
badge = {'capHeight': font['OS/2'].sCapHeight, 'tracking': round(-.4 / 15 * upm, 3), 'glyphs': letters}
(root / 'src/favorites/fonts/roman-badge-glyphs.json').write_text(json.dumps(badge, indent=2) + '\n')
