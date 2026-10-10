"""Turn prepared two-color glyphs into one filled path at build time."""

import json
import math
import re
import subprocess
import sys
import xml.etree.ElementTree as E
from pathlib import Path

import pathops
from fontTools.misc.transform import Identity, Transform
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.svgLib.path import parse_path


NS = '{http://www.w3.org/2000/svg}'
NUMBER = r'[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:[eE][-+]?\d+)?'


def transform(value):
    """Compose SVG affine transforms in SVG's written order."""
    result = Identity
    cursor = 0
    for match in re.finditer(r'([A-Za-z]+)\s*\(([^)]*)\)', value):
        if value[cursor:match.start()].strip(' ,\t\n'):
            raise ValueError(f'Invalid transform: {value}')
        name, raw = match.groups()
        args = [float(n) for n in re.findall(NUMBER, raw)]
        if re.sub(NUMBER, '', raw).strip(' ,\t\n'):
            raise ValueError(f'Invalid transform arguments: {raw}')
        if name == 'matrix' and len(args) == 6:
            item = Transform(*args)
        elif name == 'translate' and len(args) in (1, 2):
            item = Identity.translate(args[0], args[1] if len(args) == 2 else 0)
        elif name == 'scale' and len(args) in (1, 2):
            item = Identity.scale(args[0], args[-1])
        elif name == 'rotate' and len(args) in (1, 3):
            angle = math.radians(args[0])
            item = Identity.rotate(angle)
            if len(args) == 3:
                item = Identity.translate(args[1], args[2]).transform(item).translate(-args[1], -args[2])
        elif name in ('skewX', 'skewY') and len(args) == 1:
            skew = math.tan(math.radians(args[0]))
            item = Transform(1, 0, skew, 1, 0, 0) if name == 'skewX' else Transform(1, skew, 0, 1, 0, 0)
        else:
            raise ValueError(f'Unsupported transform: {name}({raw})')
        result = result.transform(item)
        cursor = match.end()
    if value[cursor:].strip(' ,\t\n'):
        raise ValueError(f'Invalid transform: {value}')
    return result


def rectangle(left, top, right, bottom):
    result = pathops.Path()
    result.moveTo(left, top)
    result.lineTo(right, top)
    result.lineTo(right, bottom)
    result.lineTo(left, bottom)
    result.close()
    return result


def primitive(element):
    tag = element.tag.removeprefix(NS)
    result = pathops.Path()
    if tag == 'path':
        parse_path(element.get('d', ''), result.getPen(allow_open_paths=False))
    elif tag == 'circle':
        # Convert rational circle segments before Boolean winding correction,
        # which the Python pathops wrapper supports only for polynomial curves.
        cx, cy, r = (float(element.get(attr, '0')) for attr in ('cx', 'cy', 'r'))
        if r <= 0:
            raise ValueError('Circle radius must be positive')
        k = math.sqrt(0.5)
        result.moveTo(cx + r, cy)
        result.conicTo(cx + r, cy + r, cx, cy + r, k)
        result.conicTo(cx - r, cy + r, cx - r, cy, k)
        result.conicTo(cx - r, cy - r, cx, cy - r, k)
        result.conicTo(cx + r, cy - r, cx + r, cy, k)
        result.close()
        result.convertConicsToQuads(0.001)
    else:
        raise ValueError(f'Unsupported glyph primitive: {tag}')
    return result


def paths(element, matrix=Identity, fill='#000', rule='nonzero'):
    """Yield paths in document paint order, including group attributes."""
    if any(key in element.attrib for key in ('mask', 'clip-path', 'filter', 'style', 'opacity', 'fill-opacity', 'stroke')):
        raise ValueError('Prepared glyph contains an unsupported paint effect')
    matrix = matrix.transform(transform(element.get('transform', '')))
    fill = element.get('fill', fill)
    rule = element.get('fill-rule', rule)
    if element.tag in (NS + 'g', NS + 'svg'):
        for child in element:
            yield from paths(child, matrix, fill, rule)
        return
    if fill == 'none':
        return
    if fill not in ('#fff', '#000') or rule not in ('nonzero', 'evenodd'):
        raise ValueError(f'Unsupported fill: {fill}, {rule}')
    shape = primitive(element).transform(*matrix)
    shape.fillType = pathops.FillType.EVEN_ODD if rule == 'evenodd' else pathops.FillType.WINDING
    yield fill, shape


def bounds(shape):
    left, top, right, bottom = shape.bounds
    return dict(x=left, y=top, width=right - left, height=bottom - top)


def compound(candidate):
    paints = list(paths(E.fromstring(candidate['body'])))
    if not paints:
        raise ValueError(f"Empty glyph: {candidate['name']}")
    all_shapes = pathops.Path()
    result = pathops.Path()
    for fill, shape in paints:
        all_shapes.addPath(shape)
        # White paints add coverage; black paints erase it. This also preserves
        # a later white shape that overlaps a black cutout in source paint order.
        operation = pathops.PathOp.UNION if fill == '#fff' else pathops.PathOp.DIFFERENCE
        result = pathops.op(result, shape, operation)
    original = bounds(all_shapes)
    if candidate['mirroredHalf']:
        if candidate['mirroredHalf'] != 'right':
            raise ValueError('Only the selected right-half mirror is supported')
        left, top, right, bottom = result.bounds
        if right <= 128:
            raise ValueError('Mirrored glyph has no right half')
        half = pathops.op(result, rectangle(128, top - 1, right + 1, bottom + 1), pathops.PathOp.INTERSECTION)
        reflected = half.transform(-1, 0, 0, 1, 256, 0)
        result = pathops.op(half, reflected, pathops.PathOp.UNION)
    if result.area <= 0:
        raise ValueError(f"Glyph has no filled area: {candidate['name']}")
    pen = SVGPathPen(None, ntos=lambda n: format(n, '.9g'))
    result.draw(pen)
    d = pen.getCommands()
    body = f'<path xmlns="http://www.w3.org/2000/svg" id="source-glyph" fill="#fff" fill-rule="nonzero" d="{d}"/>'
    return {**candidate, 'sourceBody': candidate['body'], 'body': body, 'path': d, 'bounds': bounds(result), 'originalBounds': original}


def main():
    prepared = subprocess.check_output([sys.executable, str(Path(__file__).with_name('prepare.py'))], text=True)
    candidates = json.loads(prepared)
    print(json.dumps([compound(candidate) for candidate in candidates]))


if __name__ == '__main__':
    main()
