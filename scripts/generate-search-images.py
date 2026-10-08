#!/usr/bin/env python3
"""Crop text-free search images from native export captures.

Google picks the image beside a search result itself. Its image guide asks for
an image with no text or logo, so each page names a crop of its own export in
the page's JSON-LD. The captures are search-only variants: the Dex grid without
section outlines, the Picker chart with icon-only axes, and the Brock card with
every word blanked. Each square crop is scaled 2x with nearest neighbour so the
sprites stay sharp. Keep each page's JSON-LD width and height at the printed size.

  flock /tmp/my151-browser.lock node scripts/capture-tool-art.mjs dex-plain favorites trainer-textless
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

# (capture, left, top, size) in native pixels.
CROPS = {
    # Ten full rows of ten, below the header bar.
    'dex': ('dex-plain', 32, 84, 966),
    # The icon header and Gen I-IV of the Normal to Grass columns.
    'favorites': ('picker-full-icons', 146, 106, 620),
    # From the theme box down to the last Gym Leader row.
    'trainer-card': ('trainer-textless', 0, 84, 888),
}
PAGES = {
    'hub': 'dex',
    'pokedex-builder': 'dex',
    'custom-gym-leader': 'trainer-card',
    'favorite-pokemon-picker': 'favorites',
}


def crop(name):
    capture, left, top, size = CROPS[name]
    return Image.open(source / f'{capture}.png').convert('RGB').crop((left, top, left + size, top + size))


def save(image, name):
    path = out / f'{name}.jpg'
    image.save(path, 'JPEG', quality=90, subsampling=0, optimize=True)
    print(f'Wrote {path} {image.size[0]}x{image.size[1]} {path.stat().st_size} bytes')


out.mkdir(parents=True, exist_ok=True)
crops = {name: crop(name) for name in CROPS}
for page, name in PAGES.items():
    image = crops[name]
    save(image.resize((image.width * 2, image.height * 2), Image.Resampling.NEAREST), page)
