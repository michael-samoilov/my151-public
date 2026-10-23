import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, __version__

parser = argparse.ArgumentParser()
parser.add_argument('--input', required=True)
parser.add_argument('--assets-dir', required=True)
parser.add_argument('--key', required=True)
parser.add_argument('--width', type=int, required=True)
parser.add_argument('--dpr', type=int, required=True)
args = parser.parse_args()
source = Path(args.input)
output = Path(args.assets_dir)
output.mkdir(parents=True, exist_ok=True)
with Image.open(source) as native:
    image = native.convert('RGBA')
    bounds = image.getchannel('A').getbbox()
    if not bounds:
        raise RuntimeError('Artwork capture has no visible alpha pixels')
    cropped = image.crop(bounds)
    prefix = f'home-mobile-{args.key}-{args.width}-{args.dpr}x'
    rows = {}
    for extension, options in [
        ('avif', {'format': 'AVIF', 'quality': 95, 'speed': 6, 'subsampling': '4:4:4'}),
        ('webp', {'format': 'WEBP', 'lossless': True, 'method': 6, 'exact': True}),
    ]:
        temporary = output / f'{prefix}.pending.{extension}'
        try:
            cropped.save(temporary, **options)
            data = temporary.read_bytes()
            digest = hashlib.sha256(data).hexdigest()
            destination = output / f'{prefix}-{digest[:16]}.{extension}'
            if destination.exists() and destination.read_bytes() != data:
                raise RuntimeError('Content-addressed asset collision')
            temporary.replace(destination)
            with Image.open(destination) as encoded:
                if encoded.size != cropped.size:
                    raise RuntimeError('Encoder changed artwork dimensions')
            rows[extension] = {'file': destination.name, 'path': str(destination.resolve()), 'sha256': digest, 'bytes': len(data), 'options': options}
        finally:
            temporary.unlink(missing_ok=True)
    result = {
        'pillowVersion': __version__,
        'inputSha256': hashlib.sha256(source.read_bytes()).hexdigest(),
        'capturePixelSize': list(image.size),
        'alphaCropPixels': list(bounds),
        'outputPixelSize': list(cropped.size),
        'alphaTouchesCapture': {'left': bounds[0] == 0, 'top': bounds[1] == 0, 'right': bounds[2] == image.width, 'bottom': bounds[3] == image.height},
        'formats': rows,
    }
    print(json.dumps(result))
