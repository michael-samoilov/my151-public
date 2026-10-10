import {expect, test} from '@playwright/test';
import {buildDashboard} from '../api/_dashboard';

// @viewport: the shared histogram and metric controls must fit all admin layouts.
test('recorded usage switches metrics and preserves separate tool samples @viewport', async ({page}, testInfo) => {
  const now = Date.UTC(2026,9,10,0);
  const record = {cid:'recorded-e2e',firstTs:now-3_600_000,firstAt:new Date(now-3_600_000).toISOString(),lastTs:now,
    lastAt:new Date(now).toISOString(),submits:2,sessions:1,sessionMs:[3_600_000],sessionLog:[{ts:now,ids:[1]}],
    maxDepth:1,localHour:12,everIds:[1],latestIds:[1],completed:false,exported:false};
  const response = buildDashboard({clients:{[record.cid]:JSON.stringify(record)},archived:[],funnel:{},funnelWindow:null,leagueClients:{}}, {range:'all'},now);
  await page.route('**/api/submissions?**', route => route.fulfill({json:new URL(route.request().url()).searchParams.has('usage') ? {status:'not_configured'} : response}));
  await page.addInitScript(() => {
    localStorage.setItem('p151-admin-token','e2e');
    localStorage.setItem('p151-admin-range','all');
  });
  await page.goto('/?admin');
  const panel = page.locator('section').filter({has:page.getByRole('heading',{name:'Recorded time and sessions'})});
  await expect(panel.getByText('1 recorded hours',{exact:true})).toBeVisible();
  await expect(panel.getByText('Average 60',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Sessions',exact:true}).click();
  await expect(panel.getByText('Average 1',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'League',exact:true}).click();
  await expect(panel.getByText('No dated sessions recorded.',{exact:true})).toBeVisible();
  await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'Dex',exact:true}).click();
  await expect(panel.getByText('Average 1',{exact:true})).toBeVisible();
  await panel.getByRole('button',{name:'Time',exact:true}).click();
  await expect(panel.locator('svg')).toBeVisible();
  const bounds = await panel.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await testInfo.attach('recorded-usage',{body:await panel.screenshot(),contentType:'image/png'});
});
