#!/usr/bin/env python3
"""Crop text-free search images from native export captures.

Google picks the image beside a search result itself. Its image guide asks for
an image with no text or logo, so each page names a crop of its own export in
the page's JSON-LD. The captures are search-only variants: the Dex grid without
section outlines and the Picker chart with icon-only axes. The Brock card keeps its
own small labels. Each square crop is scaled 2x with nearest neighbour so the
sprites stay sharp. Keep each page's JSON-LD width and height at the printed size.

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

CROPS = {
    'dex': ('dex-plain', 32, 84, 966),
    'favorites': ('picker-full-icons', 26, 106, 740),
    'trainer-card': ('trainer-brock', 0, 0, 888),
}
PAGES = {
    'hub': 'dex',
    'pokedex-builder': 'dex',
    'custom-gym-leader': 'trainer-card',
    'favorite-pokemon-picker': 'favorites',
}


def crop(name):
    capture, left, top, size = CROPS[name]
    image = Image.open(source / f'{capture}.png').convert('RGBA')
    # JPEG has no alpha: flatten the exports' transparent rounded corners onto white, not black.
    flat = Image.alpha_composite(Image.new('RGBA', image.size, 'white'), image).convert('RGB')
    return flat.crop((left, top, left + size, top + size))


def save(image, name):
    path = out / f'{name}.jpg'
    image.save(path, 'JPEG', quality=90, subsampling=0, optimize=True)
    print(f'Wrote {path} {image.size[0]}x{image.size[1]} {path.stat().st_size} bytes')


out.mkdir(parents=True, exist_ok=True)
crops = {name: crop(name) for name in CROPS}
for page, name in PAGES.items():
    image = crops[name]
    save(image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST), page)
