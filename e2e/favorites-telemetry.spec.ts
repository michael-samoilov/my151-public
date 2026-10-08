import { test, expect } from '@playwright/test';
test('records each export dialog, and Full, detailed stats and Simplified only after downloads succeed, with the exported board',async({page},testInfo)=>{
 const requests:Record<string,unknown>[]=[];
 await page.addInitScript(()=>localStorage.setItem('favorite-picker',JSON.stringify({state:{fills:{'water|1':7,'favorite|1':7}},version:3})));
 await page.route('**/api/favorites',async route=>{requests.push(route.request().postDataJSON());await route.fulfill({json:{ok:true}});});
 await page.goto('/favorite-pokemon-picker?lang=en');
 for(const mode of ['full','simplified']){
  await page.getByTestId('favorites-export-open').click();
  await page.locator(`[data-favorites-export-mode="${mode}"]`).click();
  if(mode==='full')await page.getByTestId('favorites-export-stats').check();
  await expect(page.getByTestId('favorites-export-save')).toBeEnabled({timeout:30000});
  const download=page.waitForEvent('download');await page.getByTestId('favorites-export-save').click();expect(await(await download).failure()).toBeNull();
  await expect.poll(()=>requests.filter(r=>r.kind==='export').length).toBe(mode==='full'?1:2);
 }
 const exports=requests.filter(r=>r.kind==='export');
 expect(exports.map(r=>r.exportKind)).toEqual(['full','simplified']);
 expect(exports.map(r=>r.stats)).toEqual([true,undefined]);
 const shown=requests.filter(r=>r.kind==='export-shown');
 expect(shown).toHaveLength(2);expect(shown[0].snapshot).toEqual(exports[0].snapshot);
 expect(exports[0].snapshot).toEqual({v:1,fills:{'water|1':7,'favorite|1':7}});
 expect(exports[0].cid).toBe(exports[1].cid);expect(exports[0].id).not.toBe(exports[1].id);
 await testInfo.attach('successful-modes',{body:JSON.stringify([...shown,...exports].map(r=>({kind:r.kind,exportKind:r.exportKind,stats:r.stats,snapshot:r.snapshot})),null,2),contentType:'application/json'});
});
test('does not send opted-out Picker activity',async({page},testInfo)=>{
 const requests:string[]=[];await page.route('**/api/favorites',async route=>{requests.push(route.request().url());await route.fulfill({json:{ok:true}});});
 await page.goto('/favorite-pokemon-picker?notme&lang=en');
 await page.getByTestId('favorites-export-open').click();await expect(page.getByTestId('favorites-export-save')).toBeEnabled({timeout:30000});
 const download=page.waitForEvent('download');await page.getByTestId('favorites-export-save').click();await download;
 expect(requests).toEqual([]);await testInfo.attach('excluded-requests',{body:JSON.stringify({requests:0}),contentType:'application/json'});
});
