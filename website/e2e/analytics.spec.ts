import {test,expect} from '@playwright/test';
test.use({storageState:{cookies:[],origins:[]}});
const storageKey='domosenso-analytics-consent-v1';
for(const locale of ['en'] as const){
 test(`${locale}: analytics waits for consent and refusal persists across pages`,async({page})=>{
  const requests:string[]=[];
  await page.route('https://www.googletagmanager.com/gtag/js?*',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''});});
  await page.goto(`/`);
  const panel=page.getByRole('region',{name:'Privacy & analytics',exact:true});
  await expect(panel).toBeVisible();
  expect(requests).toHaveLength(0);
  await panel.getByRole('button',{name:'Decline',exact:true}).click();
  await expect(panel).toHaveCount(0);
  await page.goto('/docs/');
  await expect(page.locator('.analytics-consent')).toHaveCount(0);
  expect(requests).toHaveLength(0);
  expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).choice,storageKey)).toBe('denied');
 });
}
test('acceptance loads one tag, removes query data from page views, and can be revoked',async({page})=>{
 const requests:string[]=[];
 await page.route('https://www.googletagmanager.com/gtag/js?*',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''});});
 await page.goto('/components/ramka/?email=private@example.com#contact');
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
 await expect.poll(()=>requests.length).toBe(1);
 const commands=await page.evaluate(()=>((window as unknown as {dataLayer:Array<ArrayLike<unknown>>}).dataLayer).map(item=>Array.from(item)));
 const views=commands.filter(command=>command[0]==='event'&&command[1]==='page_view');
 expect(views).toHaveLength(1);
 expect(views[0][2]).toMatchObject({page_location:'http://127.0.0.1:4336/components/ramka/'});
 expect(JSON.stringify(commands)).not.toContain('private@example.com');
 expect(commands.find(command=>command[0]==='config')?.[2]).toMatchObject({send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false});
 await page.goto('/docs/');
 await expect.poll(()=>requests.length).toBe(2);
 await page.locator('[data-analytics-settings]').click();
 await page.getByRole('button',{name:'Decline',exact:true}).click();
 await expect(page.locator('.analytics-consent')).toHaveCount(0);
 await page.reload();
 expect(requests).toHaveLength(2);
 expect(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)!).choice,storageKey)).toBe('denied');
 expect(await page.locator('script#domosenso-google-analytics').count()).toBe(0);
});


test('a read-only stored grant cannot silently restart analytics after navigation',async({page})=>{
 const requests:string[]=[];
 await page.route('https://www.googletagmanager.com/gtag/js?*',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''});});
 await page.addInitScript(key=>{
  if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify({choice:'granted',at:Date.now()}));
  const originalSet=Storage.prototype.setItem;const originalRemove=Storage.prototype.removeItem;
  Storage.prototype.setItem=function(name,value){if(name===key)throw new DOMException('Read only','QuotaExceededError');return originalSet.call(this,name,value);};
  Storage.prototype.removeItem=function(name){if(name===key)throw new DOMException('Read only','SecurityError');return originalRemove.call(this,name);};
 },storageKey);
 await page.goto('/components/ramka/');
 await expect(page.locator('.analytics-consent')).toBeVisible();
 expect(requests).toHaveLength(0);
 await page.getByRole('button',{name:'Decline',exact:true}).click();
 await expect(page.locator('.analytics-consent')).toHaveCount(0);
 await page.goto('/docs/');
 await expect(page.locator('.analytics-consent')).toBeVisible();
 expect(requests).toHaveLength(0);
});

test('revocation propagates to another open tab and deletes analytics cookies',async({page,context})=>{
 const requests:string[]=[];
 await context.route('https://www.googletagmanager.com/gtag/js?*',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''});});
 await page.goto('/components/ramka/');await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
 await expect.poll(()=>requests.length).toBe(1);
 await context.addCookies([{name:'_ga',value:'fake-analytics',url:'http://127.0.0.1:4336'},{name:'_ga_DOMOTEST01',value:'fake-session',url:'http://127.0.0.1:4336'}]);
 const other=await context.newPage();await other.goto('/docs/');
 await expect.poll(()=>requests.length).toBe(2);
 await page.locator('[data-analytics-settings]').click();await page.getByRole('button',{name:'Decline',exact:true}).click();
 await expect.poll(async()=>other.locator('script#domosenso-google-analytics').count()).toBe(0);
 expect((await context.cookies()).filter(cookie=>cookie.name==='_ga'||cookie.name.startsWith('_ga_'))).toHaveLength(0);
 expect(requests).toHaveLength(2);
 await other.close();
});

test('client-side navigation records one page view per route without loading another tag',async({page})=>{
 const requests:string[]=[];
 await page.route('https://www.googletagmanager.com/gtag/js?*',async route=>{requests.push(route.request().url());await route.fulfill({contentType:'application/javascript',body:''});});
 await page.goto('/');
 await page.getByRole('button',{name:'Allow analytics',exact:true}).click();
 await expect.poll(()=>requests.length).toBe(1);
 await page.getByRole('link',{name:'Create your home project',exact:true}).click();
 await expect(page).toHaveURL(/\/get-started\/$/);
 const views=await page.evaluate(()=>((window as unknown as {dataLayer:Array<ArrayLike<unknown>>}).dataLayer).map(item=>Array.from(item)).filter(item=>item[0]==='event'&&item[1]==='page_view'));
 expect(views.map(view=>(view[2] as {page_location:string}).page_location)).toEqual(['http://127.0.0.1:4336/','http://127.0.0.1:4336/get-started/']);
 expect(requests).toHaveLength(1);
});
