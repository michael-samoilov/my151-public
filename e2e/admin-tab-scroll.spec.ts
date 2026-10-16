import { openAdmin } from './admin-ready';
import {test,expect} from '@playwright/test';

// Each dashboard tab keeps its own position; detail Back retains its existing behavior.
test('admin tabs restore independent scroll positions @viewport',async({page},testInfo)=>{
  await page.addInitScript(()=>localStorage.setItem('p151-admin-tool','all'));
  await openAdmin(page, '/?admin&demo');
  const nav=page.getByRole('navigation',{name:'Admin section'});
  await expect(nav.getByRole('button',{name:'Suite',exact:true})).toHaveAttribute('aria-pressed','true');
  const saved={Suite:500,Dex:250,League:300,Picker:200};
  const measured:Record<string,number>={};
  for(const [tab,y] of Object.entries(saved)) {
    await nav.getByRole('button',{name:tab,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
    await page.evaluate(value=>window.scrollTo(0,value),y);
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(y);
  }
  for(const [tab,y] of Object.entries(saved)) {
    await nav.getByRole('button',{name:tab,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(y);
    measured[tab]=await page.evaluate(()=>window.scrollY);
  }
  for(const tab of ['Search','Feedback']) {
    await nav.getByRole('button',{name:tab,exact:true}).click();
    await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(0);
  }
  await nav.getByRole('button',{name:'Suite',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>window.scrollY)).toBe(saved.Suite);
  await testInfo.attach('independent-tab-positions',{body:JSON.stringify(measured),contentType:'application/json'});
  await testInfo.attach('suite-restored',{body:await page.screenshot(),contentType:'image/png'});
});
