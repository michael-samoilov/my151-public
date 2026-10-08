#!/usr/bin/env python3
"""Crop text-free search images from native export captures.

Google picks the image beside a search result itself. Its image guide asks for
an image with no text or logo, so each page names a crop of its own export in
the page's JSON-LD. Each crop is 600x600 native pixels, scaled 2x with nearest
neighbour so the sprites stay sharp.

Also writes public/og-sources/dex-grid.webp, the Dex sheet of the hub share image.

  flock /tmp/my151-browser.lock node scripts/capture-tool-art.mjs league favorites dex-plain
  python3 scripts/generate-search-images.py --source-dir docs/evidence/tool-art-rebake/local
"""
from pathlib import Path
from PIL import Image
import argparse

root = Path(__file__).resolve().parent.parent
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--source-dir', default='docs/evidence/tool-art-rebake/local')
parser.add_argument('--out-dir', default='public/search')
args = parser.parse_args()
source = root / args.source_dir
out = root / args.out_dir

SIZE = 600
# (capture, left, top): a grid area of each export with no headings or labels.
CROPS = {
    'dex': ('dex-plain', 24, 78),
    'favorites': ('picker-full-horizontal', 277, 238),
    'trainer-card': ('trainer-brock', 276, 383),
}
PAGES = {
    'hub': 'dex',
    'pokedex-builder': 'dex',
    'custom-gym-leader': 'trainer-card',
    'favorite-pokemon-picker': 'favorites',
}


def crop(name):
    capture, left, top = CROPS[name]
    return Image.open(source / f'{capture}.png').convert('RGB').crop((left, top, left + SIZE, top + SIZE))


def save(image, name):
    path = out / f'{name}.jpg'
    image.save(path, 'JPEG', quality=90, subsampling=0, optimize=True)
    print(f'Wrote {path} {image.size[0]}x{image.size[1]} {path.stat().st_size} bytes')


out.mkdir(parents=True, exist_ok=True)
crops = {name: crop(name) for name in CROPS}
for page, name in PAGES.items():
    save(crops[name].resize((SIZE * 2, SIZE * 2), Image.Resampling.NEAREST), page)

grid = Image.open(source / 'dex-plain.png').convert('RGBA')
sheet = grid.resize((800, round(grid.height * 800 / grid.width)), Image.Resampling.LANCZOS)
destination = root / 'public/og-sources/dex-grid.webp'
sheet.save(destination, 'WEBP', quality=86, method=6)
print(f'Wrote {destination} {sheet.size[0]}x{sheet.size[1]} {destination.stat().st_size} bytes')
