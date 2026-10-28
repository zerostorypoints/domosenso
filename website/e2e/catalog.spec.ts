import {test,expect} from '@playwright/test';

test('catalog search, shared filters and history',async({page})=>{
 await page.goto('/components/');
 await page.getByLabel('Search components').fill('flora');
 await expect(page.locator('.browser-card')).toHaveCount(1);
 await page.getByLabel('Hardware').selectOption('none');
 await expect(page.getByText('No components match these filters.')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();
 await expect(page.locator('.browser-card')).toHaveCount(10);
 await page.getByLabel('Purpose').selectOption('climate');
 await expect(page).toHaveURL(/purpose=climate/);
 await page.goBack();
 await expect(page.getByLabel('Purpose')).toHaveValue('');
});

test('every component has a resettable illustrative example without device requests',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const requests:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4336'))requests.push(r.url());});
 for(const id of ['ramka','plants','climate-air','bermuda-presence','awnings','lights','media','calendar','weather','backup']){
  await page.goto(`/components/${id}/`);
  const demo=page.getByRole('region',{name:'Interactive example'});
  await expect(demo).toContainText('Illustrative demo');
  const buttons=demo.locator('.demo-options button');
  const initial=await demo.locator('[data-demo-headline]').textContent();
  await buttons.nth(1).click();
  await expect(demo.locator('[data-demo-headline]')).not.toHaveText(initial!);
  await demo.getByRole('button',{name:'Reset example'}).click();
  await expect(demo.locator('[data-demo-headline]')).toHaveText(initial!);
 }
 expect(errors).toEqual([]);expect(requests).toEqual([]);
});

test('views explain ownership, default and configured pages',async({page})=>{
 await page.goto('/components/climate-air/');
 await expect(page.getByText('Displayed by Ramka wall tablet').first()).toBeVisible();
 await page.goto('/components/ramka/');
 await expect(page.locator('#views')).toContainText('Enabled by default in Ramka 0.3.0');
 await expect(page.locator('#views')).toContainText('Provide climate inputs');
 await page.goto('/components/weather/');
 await expect(page.locator('#views')).toContainText('Clock & weather');
 await expect(page.locator('#views')).toContainText('Displayed by Ramka wall tablet');
 await page.goto('/components/backup/');
 await expect(page.locator('#views')).toContainText('No bundled view');
});

test('hardware and journal routes render on narrow screens',async({page},info)=>{
 for(const path of ['/components/','/components/ramka/','/devices/hlk-ld2410c/','/devices/cc1101/','/journal/','/journal/ramka-0-3-0/']){
  const response=await page.goto(path);expect(response?.status()).toBe(200);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',`https://domosenso.org${path}`);
  await page.screenshot({path:info.outputPath(path.replaceAll('/','-')+'.png'),fullPage:true});
 }
 await page.goto('/devices/hlk-ld2410c/');
 await expect(page.locator('article table').first()).toContainText('G22');
 await expect(page.getByRole('link',{name:/Open full-size diagram/})).toHaveAttribute('href',/\/wiring\/hlk-ld2410c-atom-lite.svg/);
 await expect(page.locator('article img')).toHaveAttribute('src',/\/wiring\/hlk-ld2410c-atom-lite.svg/);
 await page.goto('/journal/');await page.getByRole('button',{name:'Releases',exact:true}).click();
 await expect(page.locator('.journal-card')).toHaveCount(2);
 const rss=await page.request.get('/journal/feed.xml');expect(rss.status()).toBe(200);expect(await rss.text()).toContain('<rss');
});

test('no JavaScript retains catalog, views and journal content',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 await page.goto('http://127.0.0.1:4336/components/');await expect(page.locator('.browser-card')).toHaveCount(10);
 await page.goto('http://127.0.0.1:4336/components/ramka/');await expect(page.locator('#views')).toContainText('Home status');
 await page.goto('http://127.0.0.1:4336/journal/');await expect(page.locator('.journal-card')).toHaveCount(4);
 await context.close();
});
