#!/usr/bin/env python3
"""Resize untouched app-native PNG captures directly into both WebP widths."""
from pathlib import Path
from PIL import Image
import hashlib,json,subprocess
root=Path(__file__).resolve().parent.parent
source=root/'docs/evidence/tool-art-rebake/local'
home=root/'src/assets/home'
pairs={'picker-simplified-portrait':'tool-favorites','picker-full-portrait':'tool-favorites-b','trainer-brock':'tool-league','league-story':'tool-league-b','dex-grid':'tool-dex','dex-stats':'tool-dex-b'}
rows=[]
source_refs=json.loads((source/'source-refs.json').read_text()) if (source/'source-refs.json').exists() else {}
for capture,target in pairs.items():
    path=source/f'{capture}.png'
    if not path.exists(): continue
    native=Image.open(path).convert('RGBA')
    for width in [800,400]:
        destination=home/f'{target}{"" if width==800 else "-400"}.webp'
        previous=subprocess.check_output(['git','show',f'db5f531c:{destination.relative_to(root)}'],cwd=root)
        image=native.resize((width,round(native.height*width/native.width)),Image.Resampling.LANCZOS)
        image.save(destination,'WEBP',quality=86,method=6)
        rows.append({'source':str(path.relative_to(root)),'sourceRef':source_refs.get(capture),'sourceSize':[native.width,native.height],'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output':str(destination.relative_to(root)),'outputSize':list(image.size),'oldBytes':len(previous),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
path=source/'dex-build.png'
if path.exists():
    native=Image.open(path).convert('RGBA'); image=native.resize((800,round(native.height*800/native.width)),Image.Resampling.LANCZOS)
    destination=root/'public/og-sources/dex-build.webp';destination.parent.mkdir(exist_ok=True);image.save(destination,'WEBP',quality=86,method=6)
    rows.append({'source':str(path.relative_to(root)),'sourceRef':source_refs.get('dex-build'),'sourceSize':list(native.size),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output':str(destination.relative_to(root)),'outputSize':list(image.size),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
(root/'docs/evidence/tool-art-rebake/asset-manifest.json').write_text(json.dumps({'captureRef':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'encoder':'Pillow WebP quality86 method6; each width from untouched PNG; Lanczos','assets':rows},indent=2)+'\n')
print([(r['output'],r['outputSize'],r['bytes'])for r in rows])
