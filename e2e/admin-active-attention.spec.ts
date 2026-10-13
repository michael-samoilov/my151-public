import {expect,test} from '@playwright/test';
import {buildDashboard} from '../api/_dashboard';
// @viewport: source controls and measured provenance must remain usable in every layout.
test('active time keeps historical spans separate and shares metric/tool controls @viewport',async({page},info)=>{
 const now=Date.UTC(2026,9,10),start=now-3_600_000;
 const record={cid:'attention-e2e-browser',firstTs:start,firstAt:new Date(start).toISOString(),lastTs:now,lastAt:new Date(now).toISOString(),submits:2,sessions:1,sessionMs:[3_600_000],sessionLog:[{ts:now,ids:[1]}],maxDepth:1,localHour:12,everIds:[1],latestIds:[1],completed:false,exported:false,
  attention:{v:1,coverageFrom:start,checkpointFrom:now,asOf:now,totalMs:120_000,segments:[{id:'attention-e2e-001',start,end:start+60_000},{id:'attention-e2e-002',start:start+360_000,end:start+420_000}]}};
 const data=buildDashboard({clients:{[record.cid]:JSON.stringify(record)},archived:[],funnel:{},funnelWindow:null,leagueClients:{}},{range:'all'},now);
 await page.route('**/api/submissions?**',route=>route.fulfill({json:new URL(route.request().url()).searchParams.has('usage')?{status:'not_configured'}:data}));
 await page.addInitScript(()=>{localStorage.setItem('p151-admin-token','e2e');localStorage.setItem('p151-admin-range','all');});
 await page.goto('/?admin');
 const panel=page.locator('section').filter({has:page.getByRole('heading',{name:'Recorded time and sessions'})});
 await expect(panel.getByRole('button',{name:'Active',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(panel.getByText('0.03 recorded hours',{exact:true})).toBeVisible();
 await expect(panel.getByText('Idle gaps <5 min between interactions included in session length',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Tools',exact:true}).click();
 await expect(panel.getByRole('img',{name:/Recorded minutes retention by tool/})).toHaveAttribute('aria-label',/Dex 1 browsers.*League 0 browsers.*Picker 0 browsers/);
 await expect(panel.getByRole('img',{name:/Weekly recorded hours by tool/})).toHaveAttribute('aria-label',/Dex 0.03 hours; League 0 hours; Picker 0 hours/);
 await panel.getByRole('button',{name:'Legacy spans',exact:true}).click();
 await expect(panel.getByRole('button',{name:'Tools',exact:true})).toHaveAttribute('aria-pressed','true');
 await expect(panel.getByRole('img',{name:/Weekly recorded hours by tool/})).toHaveAttribute('aria-label',/Dex 1 hours; League 0 hours; Picker 0 hours/);
 await panel.getByRole('button',{name:'Active',exact:true}).click();
 await panel.getByRole('button',{name:'Overall',exact:true}).click();
 await panel.getByRole('button',{name:'Sessions',exact:true}).click();
 await expect(panel.getByText('2 recorded sessions',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Legacy spans',exact:true}).click();
 await expect(panel.getByText('1 recorded sessions',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Time',exact:true}).click();
 await expect(panel.getByText('1 recorded hours',{exact:true})).toBeVisible();
 await panel.getByRole('button',{name:'Active',exact:true}).click();
 await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'League',exact:true}).click();
 await expect(panel.getByText('No time recorded.',{exact:true})).toBeVisible();
 await info.attach('active-source-values',{body:JSON.stringify({activeMs:data.attentionUsage.all.time.total,activeSessions:data.attentionUsage.all.sessions.total,legacyMs:data.recordedUsage.all.time.total}),contentType:'application/json'});
 await info.attach('active-legacy-source',{body:await panel.screenshot(),contentType:'image/png'});
});
