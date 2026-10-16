import { openAdmin } from './admin-ready';
import {test,expect} from '@playwright/test';
import {buildDashboard,type RecordedUsageSlice} from '../api/_dashboard';

function sample(values:number[],sessions:number[],hours:number):RecordedUsageSlice {
  const distribution=(v:number[])=>({n:v.length,total:v.reduce((a,b)=>a+b,0),average:v.length?v.reduce((a,b)=>a+b,0)/v.length:null,median:v.length?[...v].sort((a,b)=>a-b)[Math.floor(v.length/2)]:null,values:v});
  return {browsers:values.length,missingTime:0,missingSessions:0,incompleteHistory:0,time:distribution(values),sessions:distribution(sessions),weekly:[{week:Date.UTC(2026,9,5),start:Date.UTC(2026,9,5),end:Date.UTC(2026,9,10),partial:true,totalMs:hours*3_600_000}]};
}

// @viewport: two independent controls, three curve colors, and shared scrub values must fit all admin widths.
test('Suite tools overlay preserves samples, ties, metric and range controls @viewport',async({page},testInfo)=>{
  const response=buildDashboard({clients:{},archived:[],funnel:{},funnelWindow:null,leagueClients:{}},{range:'all'},Date.UTC(2026,9,10));
  response.recordedUsage={all:sample([0,60_000,120_000],[1,2,3],1),dex:sample([0,60_000,120_000],[1,2,3],2),league:sample([120_000,120_000],[2,2],3),favorites:sample([60_000],[1],4)};
  response.recordedUsage.dex.weekly = Array.from({length:14},(_,i)=>({week:Date.UTC(2026,6,6+i*7),start:Date.UTC(2026,6,6+i*7),end:Date.UTC(2026,6,13+i*7),partial:false,totalMs:i===13?2*3_600_000:0}));
  await page.route('**/api/submissions?**',route=>{
    const reduced=new URL(route.request().url()).searchParams.get('range')==='7d';
    return route.fulfill({json:reduced?{...response,recordedUsage:{...response.recordedUsage,favorites:sample([],[],0)}}:response});
  });
  await page.addInitScript(()=>{
    localStorage.setItem('p151-admin-token','e2e');localStorage.setItem('p151-admin-range','all');
    const strokes:{color:string;canvas:HTMLCanvasElement}[]=[];
    (window as unknown as {recordedStrokes:typeof strokes}).recordedStrokes=strokes;
    const fill=CanvasRenderingContext2D.prototype.fill as (this:CanvasRenderingContext2D,path?:Path2D)=>void;
    CanvasRenderingContext2D.prototype.fill=function(...args:unknown[]){
      strokes.push({color:String(this.fillStyle),canvas:this.canvas});
      return Reflect.apply(fill,this,args);
    };
    const stroke=CanvasRenderingContext2D.prototype.stroke as (this:CanvasRenderingContext2D,path?:Path2D)=>void;
    CanvasRenderingContext2D.prototype.stroke=function(path?:Path2D){
      strokes.push({color:String(this.strokeStyle),canvas:this.canvas});
      if(strokes.length>5000)strokes.splice(0,1000);
      return path ? stroke.call(this,path) : stroke.call(this);
    };
  });
  await openAdmin(page, '/?admin');
  const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Recorded time and sessions'})});
  await panel.getByRole('button',{name:'Legacy spans',exact:true}).click();
  await expect(panel.getByRole('img',{name:/Recorded minutes retention: 3 browsers/})).toBeVisible();
  await panel.getByRole('button',{name:'Tools',exact:true}).click();
  const curve=panel.getByRole('img',{name:/Recorded minutes retention by tool/});
  await expect(curve).toHaveAttribute('aria-label',/Dex 3 browsers.*League 2 browsers.*Picker 1 browsers/);
  await curve.scrollIntoViewIfNeeded();
  await expect.poll(()=>curve.evaluate(el=>{
    const logs=(window as unknown as {recordedStrokes:{color:string;canvas:HTMLCanvasElement}[]}).recordedStrokes;
    return [...new Set(logs.filter(s=>el.contains(s.canvas)).map(s=>s.color))].filter(c=>['#2563eb','#d97706','#0e745e'].includes(c)).sort();
  })).toEqual(['#0e745e','#2563eb','#d97706']);
  const box=(await curve.boundingBox())!;
  await page.mouse.move(box.x+box.width-17,box.y+70);
  const readout=curve.locator('[data-scrub-readout]');
  await expect(readout).toContainText('≥ 2m');
  await expect(readout).toContainText('Dex: 33.3% (1 of 3 browsers)');
  await expect(readout).toContainText('League: 100% (2 of 2 browsers)');
  await expect(readout).toContainText('Picker: 0% (0 of 1 browsers)');
  await page.mouse.down();
  const cursor=await curve.locator('[data-scrub-line]').evaluate(el=>el.style.left);
  await page.mouse.move(box.x+box.width-18,box.y+80);
  expect(await curve.locator('[data-scrub-line]').evaluate(el=>el.style.left)).toBe(cursor);
  await page.mouse.up();
  const weekly=panel.getByRole('img',{name:/Weekly recorded hours by tool/});
  await expect(weekly).toHaveAttribute('aria-label',/Dex 2 hours; League 3 hours; Picker 4 hours/);
  await weekly.scrollIntoViewIfNeeded();
  await expect.poll(()=>weekly.evaluate(el=>{
    const logs=(window as unknown as {recordedStrokes:{color:string;canvas:HTMLCanvasElement}[]}).recordedStrokes;
    return [...new Set(logs.filter(s=>el.contains(s.canvas)).map(s=>s.color))].filter(c=>['#2563eb','#d97706','#0e745e'].includes(c)).sort();
  })).toEqual(['#0e745e','#2563eb','#d97706']);
  const wb=(await weekly.boundingBox())!;
  await page.mouse.move(wb.x+wb.width-17,wb.y+60);
  await expect(weekly.locator('[data-scrub-readout]')).toContainText('League: 3 recorded hours');
  await panel.getByRole('button',{name:'Sessions',exact:true}).click();
  await expect(panel.getByRole('button',{name:'Tools',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(panel.getByRole('img',{name:/Recorded sessions retention by tool/})).toBeVisible();
  await page.getByRole('group',{name:'Date range'}).getByRole('button',{name:'7d',exact:true}).click();
  const sessions=panel.getByRole('img',{name:/Recorded sessions retention by tool/});
  await expect(sessions).toHaveAttribute('aria-label',/Picker 0 browsers/);
  await sessions.scrollIntoViewIfNeeded();
  const sb=(await sessions.boundingBox())!;
  await page.mouse.move(sb.x+sb.width-17,sb.y+70);
  await expect(sessions.locator('[data-scrub-readout]')).toContainText('Picker: — (0 of 0 browsers)');
  const nav=page.getByRole('navigation',{name:'Admin section'});
  await nav.getByRole('button',{name:'Dex',exact:true}).click();
  await expect(panel.getByRole('group',{name:'Recorded scope'})).toHaveCount(0);
  await expect(panel.getByRole('img',{name:/Recorded sessions retention: 3 browsers/})).toBeVisible();
  await nav.getByRole('button',{name:'Suite',exact:true}).click();
  await panel.getByRole('button',{name:'Overall',exact:true}).click();
  await expect(panel.getByRole('img',{name:/Recorded sessions retention: 3 browsers/})).toBeVisible();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-document.documentElement.clientWidth);
  expect(overflow).toBe(0);
  await testInfo.attach('suite-tools-metrics',{body:JSON.stringify({curveColors:['#0e745e','#2563eb','#d97706'],overflow,toolSamples:[3,2,1],emptySample:0}),contentType:'application/json'});
  await testInfo.attach('suite-overall-restored',{body:await panel.screenshot(),contentType:'image/png'});
});
