#!/usr/bin/env python3
"""Shrink the sprite PNGs losslessly and record each re-encoded file.

Requires pyoxipng 9.1.1 and Pillow: `pip install pyoxipng==9.1.1 pillow`.

oxipng recompresses each PNG under public/sprites that still matches production
and drops metadata that no browser renders. Chunks that can change displayed
color or size are copied back byte for byte. A file is written only when it is
smaller, decodes to the same RGBA, and its copied chunks stay valid for its new
color type. scripts/sprite-reencodes.json records the first 8 hex digits of the
MD5 of each written file, so check-sprite-revisions.mjs can tell a re-encode
from new art.

Usage: python3 scripts/optimize-sprites.py [base-ref]
"""
from collections import Counter
from pathlib import Path
import hashlib
import io
import json
import struct
import subprocess
import sys
import oxipng
from PIL import Image

root = Path(__file__).resolve().parent.parent
base = sys.argv[1] if len(sys.argv) > 1 else 'origin/claude/pokedex-region-builder-AviYF'
manifest_file = root / 'scripts/sprite-reencodes.json'
# Other files pin these bytes: scripts/type-icons/game-calibration.json hashes
# types/small, and public/sprites/export/README.md promises the original files.
PINNED = ('public/sprites/types/small/', 'public/sprites/export/')
KEPT = {b'gAMA', b'cHRM', b'sRGB', b'iCCP', b'sBIT', b'cICP', b'pHYs'}
DROPPED = {b'tEXt', b'zTXt', b'iTXt', b'tIME', b'eXIf', b'bKGD'}
REBUILT = {b'IHDR', b'PLTE', b'tRNS', b'IDAT', b'IEND'}
SBIT_LENGTH = {0: 1, 2: 3, 3: 3, 4: 2, 6: 4}


def chunks(data):
    """Yield (type, whole chunk) pairs. Each whole chunk keeps its length and CRC."""
    pos = 8
    while pos < len(data):
        length = struct.unpack('>I', data[pos:pos + 4])[0]
        yield data[pos + 4:pos + 8], data[pos:pos + 12 + length]
        pos += 12 + length


def fits(kept, old, new):
    """Whether the copied chunks are valid for the new IHDR (bit depth at byte 24, color type at 25)."""
    depth, color_type = new[24], new[25]
    for kind, chunk in kept:
        if kind == b'sBIT' and (len(chunk) - 12 != SBIT_LENGTH[color_type] or max(chunk[8:-4]) > (8 if color_type == 3 else depth)):
            return False
        if kind in (b'iCCP', b'cICP') and (old[25] in (0, 4)) != (color_type in (0, 4)):
            return False
    return True


def reencode(data, kept, **options):
    optimized = oxipng.optimize_from_memory(data, level=6, strip=oxipng.StripChunks.all(), **options)
    # 33 bytes are the signature and IHDR. The copied chunks then precede PLTE and IDAT, as the PNG spec requires.
    return optimized[:33] + b''.join(chunk for _, chunk in kept) + optimized[33:]


def rgba(data):
    with Image.open(io.BytesIO(data)) as image:
        return image.size, image.convert('RGBA').tobytes()


def problem(old, new, kept):
    if rgba(old) != rgba(new):
        return 'decodes to different RGBA'
    if [(kind, chunk) for kind, chunk in chunks(new) if kind in KEPT] != kept:
        return 'does not keep its color chunks byte for byte'
    if not fits(kept, old, new):
        return 'keeps a color chunk that its new color type makes invalid'
    return None


listing = subprocess.run(['git', 'ls-tree', '-r', base, '--', 'public/sprites'], cwd=root, capture_output=True, text=True, check=True).stdout
production = {line.split('\t')[1]: line.split()[2] for line in listing.splitlines()}
manifest = json.loads(manifest_file.read_text()) if manifest_file.exists() else {}
counts = Counter()
before = after = 0
for path in sorted((root / 'public/sprites').rglob('*.png')):
    name = path.relative_to(root).as_posix()
    data = path.read_bytes()
    if name.startswith(PINNED):
        counts['pinned'] += 1
        continue
    if production.get(name) != hashlib.sha1(b'blob %d\0' % len(data) + data).hexdigest():
        if manifest.get(name[len('public'):]) == hashlib.md5(data).hexdigest()[:8]:
            counts['already re-encoded'] += 1
        else:
            counts['differs from production'] += 1
            print(f'{name}: differs from {base}. Only a file that matches it can be re-encoded. Skipped.')
        continue
    unknown = {kind for kind, _ in chunks(data)} - KEPT - DROPPED - REBUILT
    if unknown:
        counts['failed'] += 1
        print(f'{name}: has chunks this script does not handle: {sorted(unknown)}. Not written.')
        continue
    kept = [(kind, chunk) for kind, chunk in chunks(data) if kind in KEPT]
    new = reencode(data, kept)
    if not fits(kept, data, new):
        new = reencode(data, kept, color_type_reduction=False, grayscale_reduction=False, bit_depth_reduction=False)
    if len(new) >= len(data):
        counts['not smaller'] += 1
        continue
    reason = problem(data, new, kept)
    if reason:
        counts['failed'] += 1
        print(f'{name}: the re-encode {reason}. Not written.')
        continue
    path.write_bytes(new)
    manifest[name[len('public'):]] = hashlib.md5(new).hexdigest()[:8]
    counts['rewritten'] += 1
    before += len(data)
    after += len(new)

manifest_file.write_text(json.dumps(dict(sorted(manifest.items())), indent=2) + '\n')
print(', '.join(f'{count} {outcome}' for outcome, count in sorted(counts.items())))
print(f'Rewritten files: {before} -> {after} bytes.')
sys.exit(1 if counts['failed'] else 0)
