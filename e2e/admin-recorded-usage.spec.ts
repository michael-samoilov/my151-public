import {expect, test} from '@playwright/test';
import {buildDashboard} from '../api/_dashboard';

// @viewport: both charts, the long-tail distribution, and metric controls must fit every admin layout.
test('recorded usage switches metrics and preserves separate tool samples @viewport', async ({page}, testInfo) => {
  const now = Date.UTC(2026,9,10,0);
  const record = {cid:'recorded-e2e',firstTs:now-3_600_000,firstAt:new Date(now-3_600_000).toISOString(),lastTs:now,
    lastAt:new Date(now).toISOString(),submits:2,sessions:1,sessionMs:[3_600_000],sessionLog:[{ts:now,ids:[1]}],
    maxDepth:1,localHour:12,everIds:[1],latestIds:[1],completed:false,exported:false};
  const clients=Object.fromEntries([0,0,120_000,1368*60_000].map((duration,i)=>{
    const ts=i===0 ? now-6*7*86_400_000 : now;
    const row={...record,cid:`recorded-e2e-${i}`,firstTs:ts-duration,lastTs:ts,sessionMs:[duration],sessionLog:[{ts,ids:[1]}]};
    return [row.cid,JSON.stringify(row)];
  }));
  const response = buildDashboard({clients,archived:[],funnel:{},funnelWindow:null,leagueClients:{}}, {range:'all'},now);
  await page.route('**/api/submissions?**', route => route.fulfill({json:new URL(route.request().url()).searchParams.has('usage') ? {status:'not_configured'} : response}));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token','e2e');
    localStorage.setItem('p151-admin-range','all');
  });
  await page.goto('/?admin');
  const panel = page.locator('section').filter({has:page.getByRole('heading',{name:'Recorded time and sessions'})});
  await expect(panel.getByText('22.83 recorded hours',{exact:true})).toBeVisible();
  await expect(panel.getByText('Average 342.5',{exact:true})).toBeVisible();
  await expect(panel.getByText('Median 2',{exact:true})).toBeVisible();
  await expect(panel.getByRole('img',{name:'Cumulative recorded minutes: 4 browsers, 2 at zero, maximum 1,368 minutes. Compressed logarithmic axis in original units.',exact:true})).toBeVisible();
  const curve=panel.getByRole('img',{name:/Cumulative recorded minutes/});
  await curve.scrollIntoViewIfNeeded();
  const curveBox=await curve.boundingBox();
  await page.mouse.move(curveBox!.x+41,curveBox!.y+90);
  await expect(curve.getByText('50%',{exact:true})).toBeVisible();
  await expect(curve).toContainText('of browsers (2 of 4)');
  await expect(panel.getByRole('img',{name:/Weekly recorded hours: 7 Monday UTC weeks, 2 partial weeks; total 22.83 hours/})).toBeVisible();
  await panel.getByRole('button',{name:'Sessions',exact:true}).click();
  await expect(panel.getByText('Average 1',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'League',exact:true}).click();
  await expect(panel.getByText('No dated sessions recorded.',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'Dex',exact:true}).click();
  await expect(panel.getByText('Average 1',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Time',exact:true}).click();
  await expect(panel.getByRole('img',{name:/Cumulative recorded minutes/}).locator('canvas')).toBeVisible();
  const weekly=panel.getByRole('img',{name:/Weekly recorded hours/});
  await weekly.scrollIntoViewIfNeeded();
  const box=await weekly.boundingBox();
  await page.mouse.move(box!.x+box!.width-16,box!.y+60);
  await expect(weekly.locator('[data-scrub-readout]')).toContainText('22.83 recorded hours');
  await expect(weekly.locator('[data-scrub-readout]')).toContainText('partial week');
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await testInfo.attach('recorded-usage',{body:await panel.screenshot(),contentType:'image/png'});
});
