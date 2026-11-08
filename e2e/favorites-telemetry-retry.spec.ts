import { test, expect, type Page } from './support/test';
const seedPlacedFavorite=(page:Page)=>page.addInitScript(()=>localStorage.setItem('favorite-picker',JSON.stringify({state:{fills:{'water|1':7}},version:3})));
for(const failure of ['network','500','429','contended'] as const){
 test(`retries ${failure} with one stable request identity`,async({page},testInfo)=>{
  const requests:Record<string,unknown>[]=[];
  await seedPlacedFavorite(page);
  await page.route('**/api/favorites',async route=>{
   requests.push(route.request().postDataJSON());
   if(requests.length===1){
    if(failure==='network'){await route.abort('failed');return;}
    await route.fulfill({status:failure==='500'?500:failure==='429'?429:200,
     headers:failure==='429'?{'Retry-After':'1'}:{},json:failure==='contended'?{ok:true,contended:true}:{error:'temporary'}});return;
   }
   await route.fulfill({json:{ok:true}});
  });
  await page.goto('/favorite-pokemon-picker?lang=en');
  await expect.poll(()=>requests.length,{timeout:10_000}).toBe(2);
  expect(requests[0].id).toBe(requests[1].id);expect(requests[0].snapshot).toEqual(requests[1].snapshot);
  if(failure==='500'){await page.waitForTimeout(4500);expect(requests).toHaveLength(2);}
  await testInfo.attach('stable-operation-retry',{body:JSON.stringify({failure,attempts:2,sameId:true,snapshot:requests[1].snapshot}),contentType:'application/json'});
 });
}
test('bounds repeated failure to three attempts and keeps the same exported operation ID',async({page},testInfo)=>{
 const requests:Record<string,unknown>[]=[];
 await seedPlacedFavorite(page);
 await page.route('**/api/favorites',async route=>{const body=route.request().postDataJSON();requests.push(body);await route.fulfill({status:body.kind==='export'?500:200,json:body.kind==='export'?{error:'temporary'}:{ok:true}});});
 await page.goto('/favorite-pokemon-picker?lang=en');await page.getByTestId('favorites-export-open').click();
 await expect(page.getByTestId('favorites-export-save')).toBeEnabled({timeout:30_000});
 const download=page.waitForEvent('download');await page.getByTestId('favorites-export-save').click();await download;
 await expect.poll(()=>requests.filter(r=>r.kind==='export').length).toBe(3);
 await page.waitForTimeout(1800);expect(requests.filter(r=>r.kind==='export')).toHaveLength(3);
 const exports=requests.filter(r=>r.kind==='export');expect(new Set(exports.map(r=>r.id)).size).toBe(1);
 await testInfo.attach('bounded-export-retry',{body:JSON.stringify({attempts:3,distinctIds:1}),contentType:'application/json'});
});
test('an old acknowledgment does not suppress a newer board that undoes a change',async({page},testInfo)=>{
 const requests:Record<string,unknown>[]=[];let release:()=>Promise<void>=async()=>{};
 await seedPlacedFavorite(page);
 await page.route('**/api/favorites',async route=>{
  requests.push(route.request().postDataJSON());
  if(requests.length===1){release=()=>route.fulfill({json:{ok:true}});return;}
  await route.fulfill({json:{ok:true}});
 });
 await page.goto('/favorite-pokemon-picker?lang=en');await expect.poll(()=>requests.length).toBe(1);
 await page.getByTestId('favorites-cell-fire-1').click();await page.getByTestId('favorites-pick-4').click();await page.keyboard.press('Escape');
 await expect.poll(()=>requests.length,{timeout:8000}).toBe(2);
 await release();
 await page.getByTestId('favorites-cell-fire-1').click();await page.getByTestId('favorites-pick-4').click();await page.keyboard.press('Escape');
 await expect.poll(()=>requests.length,{timeout:8000}).toBe(3);
 expect(requests.map(r=>(r.snapshot as {fills:unknown}).fills)).toEqual([{'water|1':7}, {'water|1':7,'fire|1':4}, {'water|1':7}]);
 await testInfo.attach('undone-board-after-late-ack',{body:JSON.stringify(requests.map(r=>r.snapshot)),contentType:'application/json'});
});
