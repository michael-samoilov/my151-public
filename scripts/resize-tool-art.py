#!/usr/bin/env python3
"""Resize untouched app-native PNG captures directly into both WebP widths."""
from pathlib import Path
from PIL import Image,ImageDraw,ImageChops
import argparse,hashlib,json,subprocess
root=Path(__file__).resolve().parent.parent
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('captures',nargs='*')
parser.add_argument('--source-dir',default='docs/evidence/tool-art-rebake/local')
parser.add_argument('--manifest',default='docs/evidence/tool-art-rebake/asset-manifest.json')
parser.add_argument('--base-ref',default='db5f531c')
args=parser.parse_args()
source=root/args.source_dir
home=root/'src/assets/home'
pairs={'picker-simplified-portrait':'tool-favorites','picker-full-portrait':'tool-favorites-b','trainer-brock':'tool-league','league-story':'tool-league-b','dex-build':'tool-dex','dex-stats':'tool-dex-b'}
rows=[]
source_refs=json.loads((source/'source-refs.json').read_text()) if (source/'source-refs.json').exists() else {}
for capture,target in pairs.items():
    if args.captures and capture not in args.captures: continue
    path=source/f'{capture}.png'
    if not path.exists(): continue
    native=Image.open(path).convert('RGBA')


    if capture=='dex-build':
        scale=4
        mask=Image.new('L',(native.width*scale,native.height*scale),0)
        ImageDraw.Draw(mask).rounded_rectangle((0,0,mask.width-1,mask.height-1),radius=native.width*0.02*scale,fill=255)
        mask=mask.resize(native.size,Image.Resampling.LANCZOS)
        native.putalpha(ImageChops.multiply(native.getchannel('A'),mask))
    for width in [800,400]:
        destination=home/f'{target}{"" if width==800 else "-400"}.webp'
        previous=subprocess.check_output(['git','show',f'{args.base_ref}:{destination.relative_to(root)}'],cwd=root)
        image=native.resize((width,round(native.height*width/native.width)),Image.Resampling.LANCZOS)
        image.save(destination,'WEBP',quality=86,method=6)
        rows.append({'source':str(path.relative_to(root)),'sourceRef':source_refs.get(capture),'sourceSize':[native.width,native.height],'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output':str(destination.relative_to(root)),'outputSize':list(image.size),'oldBytes':len(previous),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
path=source/'dex-build.png'
if path.exists() and (not args.captures or 'dex-build' in args.captures):
    native=Image.open(path).convert('RGBA'); image=native.resize((800,round(native.height*800/native.width)),Image.Resampling.LANCZOS)
    destination=root/'public/og-sources/dex-build.webp';destination.parent.mkdir(exist_ok=True);image.save(destination,'WEBP',quality=86,method=6)
    rows.append({'source':str(path.relative_to(root)),'sourceRef':source_refs.get('dex-build'),'sourceSize':list(native.size),'sourceSha256':hashlib.sha256(path.read_bytes()).hexdigest(),'output':str(destination.relative_to(root)),'outputSize':list(image.size),'bytes':destination.stat().st_size,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest()})
og_rows=[]
for name in ['og-image.png','og-gym-leader.png','og-favorite-picker.png']:
    path=source/'og'/name
    if path.exists():
        image=Image.open(path)
        previous=subprocess.check_output(['git','show',f'db5f531c:public/{name}'],cwd=root)
        og_rows.append({'reviewFile':str(path.relative_to(root)),'output':f'public/{name}','outputSize':list(image.size),'oldBytes':len(previous),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'metadata':image.info})
(root/args.manifest).write_text(json.dumps({'baseRef':args.base_ref,'captureRef':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'encoder':'Pillow WebP quality86 method6; each width from untouched PNG; Lanczos','assets':rows,'og':og_rows,'ogGeneratorSha256':hashlib.sha256((root/'scripts/generate-og-image.mjs').read_bytes()).hexdigest()},indent=2)+'\n')
print([(r['output'],r['outputSize'],r['bytes'])for r in rows])
