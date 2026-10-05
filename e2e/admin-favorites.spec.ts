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
    await expect(page.getByRole('table',{name:'Favorite Pokémon portrait full grid'})).toBeVisible();
    await expect(detail.getByRole('heading')).toHaveCount(0);
    await expect(page.getByTestId('session-playhead-count')).toHaveCount(0);
    const grid=page.getByTestId('admin-favorite-snapshot');
    const images=grid.locator('[data-favorite-sprite]');
    await expect(images).toHaveCount(257);
    const slider=page.getByRole('slider',{name:'Scrub sessions'});
    await slider.focus();await slider.press('Home');
    await expect(slider).toHaveAttribute('aria-valuetext',/0 of 257 cells/);
    await expect(images).toHaveCount(0);
    await slider.press('End');
    await expect(images).toHaveCount(257);
    await expect(page.getByRole('group',{name:"This browser's tools"}).getByRole('button',{name:'Picker',exact:true}).last()).toBeEnabled();
    await expect(slider).toHaveAttribute('aria-valuetext',/257 of 257 cells/);
    await expect(grid.getByRole('columnheader')).toHaveCount(13);
    await expect(grid.getByRole('rowheader')).toHaveCount(22);
    await expect(grid.getByRole('row')).toHaveCount(23);
    const measurement=await portraitMeasurement(page);
    expect(measurement.overflow).toBe(0);
    expect(measurement.height).toBeLessThanOrEqual(measurement.viewport);
    expect(measurement.coordinates).toBe(264);
    expect(measurement.filled).toBe(257);
    expect(measurement.outside).toBe(0);
    expect(measurement.internalScrolling).toBe(0);
    await testInfo.attach('picker-admin-session.json',{body:JSON.stringify(measurement),contentType:'application/json'});
    await testInfo.attach('picker-admin-portrait.png',{body:await page.screenshot(),contentType:'image/png'});
  });
  test('the full portrait board refits when the available viewport height shrinks',async({page},testInfo)=>{
    await page.goto('/?admin&demo');
    await page.getByRole('navigation',{name:'Admin section'}).getByRole('button',{name:'Picker',exact:true}).click();
    await page.locator('[data-favorite-user="demo-picker-6"]').click();
    await expect(page.getByTestId('admin-favorite-snapshot').locator('[data-favorite-sprite]')).toHaveCount(257);
    await page.setViewportSize({width:page.viewportSize()!.width,height:568});
    await expect.poll(async()=>{const m=await portraitMeasurement(page);return m.outside+m.internalScrolling+Math.max(0,m.bottom-m.viewport);}).toBe(0);
    const measurement=await portraitMeasurement(page);
    expect(measurement.coordinates).toBe(264);
    expect(measurement.overflow).toBe(0);
    expect(measurement.height).toBeLessThanOrEqual(568);
    await testInfo.attach('picker-admin-short-portrait.json',{body:JSON.stringify(measurement),contentType:'application/json'});
    await testInfo.attach('picker-admin-short-portrait.png',{body:await page.screenshot(),contentType:'image/png'});
  });
});

async function portraitMeasurement(page:import('@playwright/test').Page){
  return page.evaluate(()=>{
    const grid=document.querySelector('[data-testid="admin-favorite-snapshot"]')!;
    const box=grid.getBoundingClientRect();
    const cells=[...grid.querySelectorAll('[data-favorite-coordinate]')];
    const outside=cells.filter(cell=>{const rect=cell.getBoundingClientRect();return rect.left<box.left-1||rect.right>box.right+1||rect.top<box.top-1||rect.bottom>box.bottom+1;}).length;
    const internalScrolling=[grid,...grid.querySelectorAll('*')].filter(el=>{const style=getComputedStyle(el);return /(auto|scroll)/.test(style.overflowX+style.overflowY)&&(el.scrollWidth>el.clientWidth+1||el.scrollHeight>el.clientHeight+1);}).length;
    return {overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,height:document.documentElement.scrollHeight,viewport:innerHeight,coordinates:cells.length,filled:grid.querySelectorAll('[data-favorite-sprite]').length,outside,internalScrolling,bottom:box.bottom};
  });
}

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
