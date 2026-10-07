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
