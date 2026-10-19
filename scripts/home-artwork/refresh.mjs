import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync,spawnSync} from 'node:child_process';
import {ASSET_DIRECTORY,WIDTHS,inputHashes,validateHomeArtwork} from './manifest.mjs';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
if(process.env.MY151_HOME_ARTWORK_LOCKED!=='1') {
  const operational=execFileSync('git',['rev-parse','--path-format=absolute','--git-path','home-artwork-runs'],{cwd:root,encoding:'utf8'}).trim();
  const out=path.join(operational,new Date().toISOString().replace(/[:.]/g,'-'));
  fs.mkdirSync(out,{recursive:true});
  const receipt={pid:process.pid,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),startedAt:new Date().toISOString(),stage:'waiting-for-browser-lock',status:'running'};
  const save=()=>fs.writeFileSync(path.join(out,'refresh.json'),JSON.stringify(receipt,null,2)+'\n');save();
  const log=fs.openSync(path.join(out,'run.log'),'a');
  try {
    const result=spawnSync('flock',[path.join(process.env.TMPDIR||'/tmp','my151-browser.lock'),'env','MY151_HOME_ARTWORK_LOCKED=1','MY151_HOME_ARTWORK_RUN='+out,process.execPath,fileURLToPath(import.meta.url)],{cwd:root,stdio:['ignore',log,log],env:process.env});
    const child=JSON.parse(fs.readFileSync(path.join(out,'refresh.json'),'utf8'));
    Object.assign(receipt,child,{wrapperPid:process.pid,exitCode:result.status??1,finishedAt:new Date().toISOString(),status:result.status===0?'PASS':'FAIL'});
    if(result.error)receipt.error=String(result.error);
    save();console.log('Home artwork evidence: '+out);process.exitCode=result.status??1;
  } finally {fs.closeSync(log);}
} else {
  const out=process.env.MY151_HOME_ARTWORK_RUN;
  if(!out)throw Error('Missing artwork operational directory');
  const receipt=JSON.parse(fs.readFileSync(path.join(out,'refresh.json'),'utf8'));
  receipt.pid=process.pid;receipt.lockAcquiredAt=new Date().toISOString();
  const save=()=>fs.writeFileSync(path.join(out,'refresh.json'),JSON.stringify(receipt,null,2)+'\n');
  const stage=name=>{receipt.stage=name;save();console.log(name);};
  const active=path.join(root,ASSET_DIRECTORY),previous=path.join(out,'previous'),staged=path.join(out,'publish');
  let published=false;
  const normalEnv={...process.env};delete normalEnv.MY151_HOME_ARTWORK_CAPTURE;
  try {
    stage('capture-build');
    const initial=inputHashes(root),captureDist=path.join(out,'capture-dist');
    execFileSync('npm',['run','build','--','--outDir',captureDist,'--emptyOutDir'],{cwd:root,stdio:'inherit',env:{...normalEnv,MY151_HOME_ARTWORK_CAPTURE:'1'}});
    stage('capturing-27-artwork-cases');
    const capture=path.join(out,'capture');
    execFileSync(process.execPath,[path.join(here,'bake.mjs'),'--root',root,'--dist',captureDist,'--out',capture],{cwd:root,stdio:'inherit',env:normalEnv});
    const raw=JSON.parse(fs.readFileSync(path.join(capture,'manifest.json'),'utf8'));
    if(raw.status!=='PASS'||raw.cases?.length!==WIDTHS.length*3||raw.cases.some(row=>row.status!=='PASS'))throw Error('Incomplete artwork capture; active assets retained');
    if(JSON.stringify(inputHashes(root))!==JSON.stringify(initial))throw Error('Artwork inputs changed during refresh');
    stage('validating-staged-assets');fs.mkdirSync(staged);
    const manifest={version:1,status:'PASS',baseCommit:raw.sourceCommit,inputs:raw.inputs,poses:structuredClone(raw.poses),provenance:{sourceCommit:raw.sourceCommit,sourceDirty:raw.sourceDirty,browserVersion:raw.browserVersion,pillowVersions:raw.pillowVersions,lockfileSha256:raw.lockfileSha256,captureCss:raw.capture.css,widths:WIDTHS,dpr:3,startedAt:raw.startedAt,finishedAt:raw.finishedAt}};
    for(const pose of manifest.poses)for(const card of pose.cards)for(const format of ['avif','webp']) {
      const asset=card[format],source=path.resolve(capture,asset.file);asset.file=path.basename(source);fs.copyFileSync(source,path.join(staged,asset.file));
    }
    fs.writeFileSync(path.join(staged,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');validateHomeArtwork(root,staged);
    stage('publishing-assets');fs.mkdirSync(path.dirname(active),{recursive:true});
    if(fs.existsSync(active))fs.renameSync(active,previous);
    try {fs.renameSync(staged,active);published=true;}
    catch(error){if(fs.existsSync(previous))fs.renameSync(previous,active);throw error;}
    stage('normal-guarded-build');
    execFileSync('npm',['run','build'],{cwd:root,stdio:'inherit',env:normalEnv});
    validateHomeArtwork(root);receipt.status='PASS';receipt.stage='complete';
  } catch(error) {
    receipt.failedStage=receipt.stage;receipt.error=String(error);receipt.status='FAIL';process.exitCode=1;
    if(published) {
      stage('restoring-previous-assets');fs.rmSync(active,{recursive:true,force:true});
      if(fs.existsSync(previous))fs.renameSync(previous,active);
      receipt.rolledBack=true;
      fs.rmSync(path.join(root,'dist'),{recursive:true,force:true});receipt.discardedFailedBuild=true;
    }
    receipt.stage='failed';console.error(error);
  } finally {receipt.finishedAt=new Date().toISOString();save();}
}
