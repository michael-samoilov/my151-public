#!/usr/bin/env python3
"""Encode the native detailed-stat/no-outline Dex export for sharing only.

This does not change homepage artwork. The input is an untouched native PNG
captured by the runtime export, rather than a recreated or edited export.
"""
from pathlib import Path
import hashlib
import json
import sys
from PIL import Image

root = Path(__file__).resolve().parent.parent
source = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else root / 'docs/evidence/tool-art-rebake/local/dex-share-stats.png'
output = root / 'public/og-sources/dex-stats.webp'
refs_file = source.parent / 'source-refs.json'
refs = json.loads(refs_file.read_text()) if refs_file.exists() else {}
native = Image.open(source).convert('RGBA')
image = native.resize((800, round(native.height * 800 / native.width)), Image.Resampling.LANCZOS)
output.parent.mkdir(parents=True, exist_ok=True)
image.save(output, 'WEBP', quality=86, method=6)
manifest = {
    'source': source.name,
    'sourceRef': refs.get(source.stem),
    'sourceSize': list(native.size),
    'sourceSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
    'output': str(output.relative_to(root)),
    'outputSize': list(image.size),
    'bytes': output.stat().st_size,
    'sha256': hashlib.sha256(output.read_bytes()).hexdigest(),
    'settings': 'Detailed Stats enabled; section outlines disabled',
    'encoder': 'Pillow WebP quality86 method6; Lanczos from native PNG',
}
(root / 'docs/evidence/share-og-refinement/source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(json.dumps(manifest, indent=2))
