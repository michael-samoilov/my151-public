import {expect,test} from '@playwright/test';
test.describe('Picker admin @viewport',()=>{
  test('shows captured progress and exclusive export views, then scrubs a read-only session snapshot',async({page},testInfo)=>{
    await page.goto('/?admin&demo');
    await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'Picker',exact:true}).click();
    await expect(page.getByRole('heading',{name:/^Picker activity/})).toBeVisible();
    const funnel=page.getByRole('img',{name:/Favorite Pokémon usage funnel/});
    await expect(funnel).toBeVisible();
    await expect(funnel).toHaveAttribute('aria-label',/Completed/);
    await page.locator('[data-favorite-user="demo-picker-6"]').click();
    const detail=page.getByTestId('admin-favorite-detail');
    await expect(detail.getByText('257 / 257 cells')).toBeVisible();
    const grid=page.getByTestId('admin-favorite-snapshot');
    const images=grid.locator('img');
    await expect(images).toHaveCount(257);
    const slider=page.getByRole('slider',{name:'Scrub sessions'});
    await slider.focus();await slider.press('Home');
    await expect(detail.getByText('0 / 257 cells')).toBeVisible();
    await expect(images).toHaveCount(0);
    await slider.press('End');
    await expect(images).toHaveCount(257);
    await expect(page.getByRole('group',{name:"This browser's tools"}).getByRole('button',{name:'Picker',exact:true}).last()).toBeEnabled();
    const measurement=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,height:document.documentElement.scrollHeight,viewport:innerHeight,coordinates:document.querySelectorAll('[data-favorite-coordinate]').length,filled:document.querySelectorAll('[data-favorite-coordinate] img').length}));
    expect(measurement.overflow).toBe(0);
    expect(measurement.height).toBeLessThanOrEqual(measurement.viewport);
    await testInfo.attach('picker-admin-session.json',{body:JSON.stringify(measurement),contentType:'application/json'});
  });
});

test.describe('Three-tool overlap @viewport',()=>{
test('a three-tool overlap keeps all seven exclusive region counts visible',async({page},testInfo)=>{
  await page.addInitScript(()=>localStorage.setItem('p151-admin-token','local'));
  const catalog=[{id:'dex',label:'Dex builder',short:'Dex',launchedAt:0},{id:'league',label:'Gym leader maker',short:'League',launchedAt:1},{id:'favorites',label:'Favorite Pokémon Picker',short:'Picker',launchedAt:null}];
  const regions={dex:1,league:1,favorites:1,'dex+league':1,'dex+favorites':1,'favorites+league':1,'dex+favorites+league':1};
  const empty={survival:[],stats:{p50:0,p75:0,p90:0},n:0};
  await page.route('**/api/submissions?**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({totalUsers:0,offset:0,limit:50,funnel:{users:0,completed:0,exported:0},retention:{returning:0,activeLast7:0,newUsers:0},timeSurvival:[],timeStats:empty.stats,depthSurvival:[],depthStats:empty.stats,countries:{},devices:{},os:{},popularFinal:[],mostDropped:[],popularBySection:{},droppedBySection:{},picksBySectionAll:{},records:[],crossTool:{catalog,kpis:[],eras:[{key:'synthetic',label:'Demo overlap',shortLabel:'Demo overlap',since:1,until:null,browsers:7,regions}]}})}));
  await page.goto('/?admin');
  const chart=page.locator('[data-testid="cross-tool-venns"] svg');
  await expect(chart.locator('g text')).toHaveCount(7);
  await expect(chart.locator('g text title',{hasText:'Dex + Picker 1'})).toHaveCount(1);
  await expect(chart.locator('g text title',{hasText:'Dex + Picker + League 1'})).toHaveCount(1);
  await testInfo.attach('seven-regions.svg',{body:await chart.evaluate(el=>el.outerHTML),contentType:'image/svg+xml'});
});

});
