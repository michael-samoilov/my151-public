import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const WIDTHS = [320,340,360,375,390,393,414,430,480];
export const CARD_KEYS = ['favorites','dex','league'];
export const ASSET_DIRECTORY = 'src/assets/home/mobile';
export const ASSET_URL = '/assets/home-mobile/';
export const INPUT_FILES = [
  'src/components/home/HomePage.tsx',
  'src/home/artwork.tsx',
  'src/home/artwork-controller.js',
  'src/components/home/useHomeSheetLift.ts',
  'src/index.css',
  'src/lib/layoutFontSize.ts',
  'src/lib/viewport.ts',
  'src/assets/fonts/inter-home-initial.woff2',
  'src/assets/fonts/inter-home-initial.json',
  'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2',
  ...['tool-dex','tool-dex-b','tool-league','tool-league-b','tool-favorites','tool-favorites-b'].flatMap(key => ['avif','webp'].map(format => 'src/assets/home/'+key+'.'+format)),
  ...['bake.mjs','encode.py','refresh.mjs','manifest.mjs'].map(file => 'scripts/home-artwork/'+file),
];
export const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
export function inputHashes(root) {
  return INPUT_FILES.map(file => ({path:file,sha256:hash(fs.readFileSync(path.join(root,file)))}));
}
function finite(value) { return typeof value === 'number' && Number.isFinite(value); }
function rectangle(value,origin) {
  return value && finite(value[origin[0]]) && finite(value[origin[1]]) && finite(value.width) && finite(value.height) && value.width>0 && value.height>0;
}
export function validateHomeArtwork(root, directory = path.join(root,ASSET_DIRECTORY)) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'),'utf8'));
  if(manifest.version!==1 || manifest.status!=='PASS') throw Error('Home artwork manifest is incomplete');
  const expected=inputHashes(root);
  if(!Array.isArray(manifest.inputs) || manifest.inputs.length!==expected.length) throw Error('Home artwork input list changed; regenerate artwork');
  for(const input of expected) {
    const matches=manifest.inputs.filter(row=>row.path===input.path);
    if(matches.length!==1 || matches[0].sha256!==input.sha256) throw Error('Stale home artwork input: '+input.path+'; regenerate artwork');
  }
  if(!Array.isArray(manifest.poses) || manifest.poses.length!==WIDTHS.length) throw Error('Home artwork requires nine phone poses');
  const used=new Set();
  for(const width of WIDTHS) {
    const matches=manifest.poses.filter(pose=>pose.viewportWidth===width);
    if(matches.length!==1) throw Error('Missing or duplicate home artwork pose '+width);
    const pose=matches[0];
    if(pose.dpr!==3 || !Array.isArray(pose.cards) || pose.cards.length!==3) throw Error('Invalid home artwork pose '+width);
    for(const key of CARD_KEYS) {
      const cards=pose.cards.filter(card=>card.key===key);
      if(cards.length!==1) throw Error('Missing or duplicate home artwork card '+key);
      const card=cards[0];
      if(!rectangle(card.panel,['x','y']) || !rectangle(card.capture,['x','y']) || !rectangle(card.trim,['left','top']) || !rectangle(card.placement,['left','top'])) throw Error('Invalid home artwork geometry '+width+'/'+key);
      if(card.trim.left<0 || card.trim.top<0 || card.trim.left+card.trim.width>Math.ceil(card.capture.width*pose.dpr)+1 || card.trim.top+card.trim.height>Math.ceil(card.capture.height*pose.dpr)+1 || !Object.values(card.trim).every(Number.isInteger)) throw Error('Invalid home artwork pixel crop');
      if(Math.abs(card.placement.left-(card.capture.x+card.trim.left/pose.dpr-card.panel.x))>1e-6 || Math.abs(card.placement.top-(card.capture.y+card.trim.top/pose.dpr-card.panel.y))>1e-6) throw Error('Home artwork placement disagrees with capture geometry');
      if(Math.abs(card.placement.width*pose.dpr-card.trim.width)>1e-6 || Math.abs(card.placement.height*pose.dpr-card.trim.height)>1e-6) throw Error('Home artwork pixel dimensions disagree with placement');
      for(const format of ['avif','webp']) {
        const asset=card[format];
        if(!asset || typeof asset.file!=='string' || asset.file!==path.basename(asset.file) || !/^[a-zA-Z0-9_-]+\.(avif|webp)$/.test(asset.file) || !asset.file.endsWith('.'+format) || used.has(asset.file)) throw Error('Invalid or duplicate home artwork filename');
        if(!/^[a-f0-9]{64}$/.test(asset.sha256) || !asset.file.includes(asset.sha256.slice(0,16))) throw Error('Home artwork filename is not content-addressed');
        used.add(asset.file);
        const bytes=fs.readFileSync(path.join(directory,asset.file));
        if(bytes.length!==asset.bytes || hash(bytes)!==asset.sha256) throw Error('Stale home artwork output: '+asset.file);
      }
    }
  }
  return manifest;
}
export function copyHomeArtwork(root,outDir) {
  const manifest=validateHomeArtwork(root),directory=path.join(root,ASSET_DIRECTORY),destination=path.join(outDir,'assets/home-mobile');
  fs.mkdirSync(destination,{recursive:true});
  for(const pose of manifest.poses)for(const card of pose.cards)for(const format of ['avif','webp'])fs.copyFileSync(path.join(directory,card[format].file),path.join(destination,card[format].file));
  return manifest;
}

export function presentationManifest(root) {
  const manifest=validateHomeArtwork(root);
  return {poses:manifest.poses.map(pose=>({viewportWidth:pose.viewportWidth,cards:pose.cards.map(card=>({key:card.key,panel:{width:card.panel.width},placement:card.placement,avif:{file:card.avif.file},webp:{file:card.webp.file}}))}))};
}
