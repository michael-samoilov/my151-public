import { afterEach, expect, test } from 'vitest';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root=join(dirname(fileURLToPath(import.meta.url)),'..');
const temporary: string[]=[];
afterEach(()=>temporary.splice(0).forEach(path=>rmSync(path,{recursive:true,force:true})));
const media='(max-width:480px) and (hover:none) and (pointer:coarse) and (any-hover:none) and (scripting:enabled)';
const empty='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const widths=[320,340,360,375,390,393,414,430,480];
const keys=['favorites','dex','league'];
const hash=(bytes: Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
const parents=(path: string)=>mkdirSync(dirname(path),{recursive:true});

async function fixture(options: { outside?: number; heavyPhone?: boolean; mutate?: (html:string)=>string; css?:string }={}) {
  const project=mkdtempSync(join(root,'.budget-fixture-'));temporary.push(project);
  for(const name of ['check-bundle-budget.mjs','home-artwork/manifest.mjs','performance/budgets.json']) {
    const dest=join(project,'scripts',name);parents(dest);copyFileSync(join(root,'scripts',name),dest);
  }
  const helper=await import('./home-artwork/manifest.mjs');
  for(const file of helper.INPUT_FILES) {
    if(file==='scripts/home-artwork/manifest.mjs')continue;
    const dest=join(project,file);parents(dest);writeFileSync(dest,file);
  }
  const dist=join(project,'dist');mkdirSync(join(dist,'.vite'),{recursive:true});mkdirSync(join(dist,'assets/home-mobile'),{recursive:true});
  const originalNames=['tool-dex','tool-dex-b','tool-league-b','tool-league','tool-favorites-b','tool-favorites'];
  const vite: Record<string, object>={};
  for(const key of originalNames)for(const format of ['avif','webp']) {
    const file='assets/'+key+'.'+format;writeFileSync(join(dist,file),Buffer.alloc(100000));vite['src/assets/home/'+key+'.'+format]={file};
  }
  let index=0;
  const assetDir=join(project,'src/assets/home/mobile');mkdirSync(assetDir,{recursive:true});
  const poses=widths.map(viewportWidth=>({viewportWidth,dpr:3,cards:keys.map(key=>{
    const card: Record<string,unknown>={key,panel:{x:0,y:0,width:100,height:100},capture:{x:0,y:0,width:100,height:100},trim:{left:0,top:0,width:300,height:300},placement:{left:0,top:0,width:100,height:100}};
    for(const format of ['avif','webp']) {
      const bytes=Buffer.alloc(options.heavyPhone&&viewportWidth===480&&format==='webp'?300000:10000,++index),sha256=hash(bytes),file='home-mobile-'+key+'-'+viewportWidth+'-'+sha256.slice(0,16)+'.'+format;
      writeFileSync(join(assetDir,file),bytes);writeFileSync(join(dist,'assets/home-mobile',file),bytes);card[format]={file,bytes:bytes.length,sha256};
    }
    return card as unknown as {key:string;avif:{file:string};webp:{file:string}};
  })}));
  writeFileSync(join(assetDir,'manifest.json'),JSON.stringify({version:1,status:'PASS',inputs:helper.inputHashes(project),poses}));
  const source=(attrs:string)=>'<source '+attrs+'/>';
  const picture=(id:string,sources:string,src:string,extra='')=>'<picture class="contents" data-home-picture="'+id+'">'+sources+'<img src="'+src+'" '+extra+'/></picture>';
  const poseMedia=(i:number)=>media+' and (min-width:'+(i?(widths[i-1]+widths[i])/2+0.001:0)+'px) and (max-width:'+(i===8?480:(widths[i]+widths[i+1])/2)+'px)';
  const url=(file:string)=>'/assets/home-mobile/'+file;
  let html='';
  keys.forEach((key,k)=>{for(let slot=0;slot<2;slot++){
    const original=key==='favorites'?originalNames.slice(4):key==='dex'?originalNames.slice(0,2):originalNames.slice(2,4);
    const file='/assets/'+original[slot];
    html+='<link rel="preload" as="image" type="image/avif" media="not all and '+media+'" href="'+file+'.avif"/>';
    html+=picture(key+'-'+slot,source('media="'+media+'" srcSet="'+empty+'"')+source('type="image/avif" srcSet="'+file+'.avif"'),file+'.webp');
    let sources='';
    if(!slot)poses.forEach((pose,i)=>{for(const format of ['avif','webp'] as const)sources+=source('media="'+poseMedia(i)+'" type="image/'+format+'" srcSet="'+url(pose.cards[k][format].file)+'"');});
    html+=picture(key+'-mobile-'+slot,sources,empty,'data-card-scene="'+key+'" data-scene-slot="'+slot+'"');
  }});
  poses.forEach((pose,i)=>pose.cards.forEach(card=>{html+='<link rel="preload" as="image" type="image/avif" media="'+poseMedia(i)+'" href="'+url(card.avif.file)+'"/>';}));
  html=options.mutate?.(html)??html;
  const budgets=JSON.parse(readFileSync(join(root,'scripts/performance/budgets.json'),'utf8'));
  for(const [name,spec] of Object.entries(budgets.pages) as [string,{html:string;startup:string[];lazy?:string[];imageFormats?:{avif:string[];webp:string[]}[]}][]) {
    writeFileSync(join(dist,spec.html),name==='hub'?html:'<html></html>');vite[spec.html]={file:'assets/empty.js',assets:(spec.imageFormats??[]).flatMap(group=>[...group.avif,...group.webp]).map(source=>'assets/'+source.split('/').pop())};
    for(const source of [...spec.startup,...spec.lazy??[]])vite[source]={file:'assets/empty.js'};
    for(const group of spec.imageFormats??[])for(const source of [...group.avif,...group.webp]){const file='assets/'+source.split('/').pop();writeFileSync(join(dist,file),'');vite[source]={file};}
  }
  writeFileSync(join(dist,'assets/empty.js'),'');writeFileSync(join(dist,'assets/style.css'),options.css??'');
  const images=originalNames.flatMap(key=>['assets/'+key+'.avif','assets/'+key+'.webp']);
  if(options.outside){writeFileSync(join(dist,'assets/outside.png'),Buffer.alloc(options.outside));images.push('assets/outside.png');}
  vite['src/components/home/HomePage.tsx']={file:'assets/empty.js',css:['assets/style.css'],assets:images};
  writeFileSync(join(dist,'.vite/manifest.json'),JSON.stringify(vite));
  const result=spawnSync(process.execPath,[join(project,'scripts/check-bundle-budget.mjs'),'--dist',dist],{encoding:'utf8'});
  return {status:result.status,output:result.stdout+result.stderr};
}

test('charges largest complete homepage set rather than every pose and format',async()=>{const r=await fixture();expect(r.status,r.output).toBe(0);expect(r.output).toContain('585.9 KiB');});
test('retains images outside the exclusive homepage union',async()=>{const r=await fixture({outside:180000});expect(r.status,r.output).toBe(1);expect(r.output).toContain('hub images');});
test('counts the largest mobile fallback even when preferred AVIF is small',async()=>{const r=await fixture({heavyPhone:true});expect(r.status,r.output).toBe(1);expect(r.output).toContain('hub images');});
test('rejects original preload without the inverse mobile media',async()=>{const r=await fixture({mutate:html=>html.replace('media="not all and '+media+'"','')});expect(r.status,r.output).toBe(1);});
test('rejects independently requested homepage assets in CSS',async()=>{const r=await fixture({css:'body{background:url(/assets/tool-dex.avif)}'});expect(r.status,r.output).toBe(1);});
test('rejects image styles that independently fetch another credited resource',async()=>{const r=await fixture({mutate:html=>html.replace('<img src=','<img style="background-image:url(/assets/tool-dex.avif)" src=')});expect(r.status,r.output).toBe(1);expect(r.output).toContain('Homepage artwork resource contract');});
