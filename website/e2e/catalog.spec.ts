import {test,expect} from '@playwright/test';

test('catalog search, shared filters and history',async({page})=>{
 await page.goto('/components/');
 await page.getByLabel('Search components').fill('flora');
 await expect(page.locator('.browser-card')).toHaveCount(1);
 await page.getByLabel('Hardware').selectOption('none');
 await expect(page.getByText('No components match these filters.')).toBeVisible();
 await page.getByRole('button',{name:'Clear filters'}).click();
 await expect(page.locator('.browser-card')).toHaveCount(11);
 await page.getByLabel('Purpose').selectOption('climate');
 await expect(page).toHaveURL(/purpose=climate/);
 await page.goBack();
 await expect(page.getByLabel('Purpose')).toHaveValue('');
});

test('every component has a resettable illustrative example without device requests',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 const requests:string[]=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4336'))requests.push(r.url());});
 for(const id of ['ramka','plants','climate-air','bermuda-presence','awnings','lights','media','calendar','weather','backup','audio-sensor']){
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
 await expect(page.locator('#views')).toContainText('Enabled by default; turn it off on the Ramka settings dashboard');
 await expect(page.locator('#views')).toContainText('Provide climate inputs');
 await page.goto('/components/weather/');
 await expect(page.locator('#views')).toContainText('Clock & weather');
 await expect(page.locator('#views')).toContainText('Displayed by Ramka wall tablet');
 await page.goto('/components/backup/');
 await expect(page.locator('#views')).toContainText('No bundled view');
});

test('hardware and journal routes render on narrow screens',async({page},info)=>{
 for(const path of ['/components/','/components/ramka/','/devices/hlk-ld2410c/','/devices/cc1101/','/journal/','/journal/ramka-0-3-0/','/journal/ramka-0-4-0/','/devices/m5stack-atom-echos3r/','/devices/shelly-pm-mini-gen3/']){
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
 await expect(page.locator('.journal-card')).toHaveCount(3);
 const rss=await page.request.get('/journal/feed.xml');expect(rss.status()).toBe(200);expect(await rss.text()).toContain('<rss');
});

test('no JavaScript retains catalog, views and journal content',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false});const page=await context.newPage();
 await page.goto('http://127.0.0.1:4336/components/');await expect(page.locator('.browser-card')).toHaveCount(11);
 await page.goto('http://127.0.0.1:4336/devices/');await expect(page.locator('.hardware-card')).toHaveCount(11);
 await page.goto('http://127.0.0.1:4336/components/ramka/');await expect(page.locator('#views')).toContainText('Home status');
 await page.goto('http://127.0.0.1:4336/journal/');await expect(page.locator('.journal-card')).toHaveCount(6);
 await context.close();
});

test('catalog sections lead from components to hardware and back from a guide',async({page},info)=>{
 await page.goto('/components/');
 const sections=page.getByRole('navigation',{name:'Catalog sections'});
 await expect(sections.getByRole('link',{name:/DomoSenso components/})).toHaveAttribute('aria-current','page');
 await sections.getByRole('link',{name:/Hardware/}).click();
 await expect(page).toHaveURL(/\/devices\/$/);
 await expect(sections.getByRole('link',{name:/Hardware/})).toHaveAttribute('aria-current','page');
 await expect(page.locator('.hardware-card')).toHaveCount(11);
 const photos=page.locator('.hardware-photo img');
 await expect(photos).toHaveCount(9);
 for(const photo of await photos.all()){
  await photo.scrollIntoViewIfNeeded();
  await expect(photo).toHaveAttribute('alt',/.+/);
  await expect.poll(()=>photo.evaluate((image:HTMLImageElement)=>image.complete&&image.naturalWidth>0)).toBe(true);
 }
 await expect(page.locator('.hardware-photo figcaption')).toHaveCount(9);
 await page.evaluate(()=>window.scrollTo(0,0));
 await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href','https://domosenso.org/devices/');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 await page.screenshot({path:info.outputPath('hardware-index.png'),fullPage:true});
 const radio=page.locator('.hardware-card').filter({has:page.getByRole('heading',{name:'CC1101 radio module'})});
 await expect(radio.getByRole('link',{name:'Awnings'})).toHaveAttribute('href','/components/awnings/');
 await radio.getByRole('link',{name:'Open device guide'}).click();
 await expect(page).toHaveURL(/\/devices\/cc1101\/$/);
 await expect(page.locator('.hardware-photo-detail img')).toHaveAttribute('src','/hardware/cc1101.webp');
 await page.getByRole('link',{name:'All hardware',exact:true}).first().click();
 await expect(page).toHaveURL(/\/devices\/$/);
 await sections.getByRole('link',{name:/DomoSenso components/}).click();
 await expect(page.locator('.browser-card')).toHaveCount(11);
});

test('how-to guides: index, branch table, agent prompt, structured data and drafts kept off production',async({page})=>{
 await page.goto('/how-to/');
 await expect(page.locator('.howto-card')).toHaveCount(5);
 const response=await page.goto('/how-to/automate-old-awnings/');expect(response?.status()).toBe(200);
 await expect(page.locator('h1')).toHaveCount(1);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 const wall=page.locator('table.howto-branches tbody tr').filter({hasText:'buttons in the wall'});
 await expect(wall).toHaveCount(1);
 await expect(wall.getByRole('link')).toHaveAttribute('href',/\/issues\/74$/);
 await expect(page.locator('.howto-prompt').first()).toContainText('Tell your agent');
 await expect(page.locator('.howto-prompt h2')).toHaveText(['Tell your agent']);
 await expect(page.locator('.howto-lead')).toContainText('Somfy remote');
 expect(await page.evaluate(()=>!!(document.querySelector('.howto-lead')!.compareDocumentPosition(document.querySelector('table.howto-branches')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
 const ld=await page.locator('script[type="application/ld+json"]').first().textContent();
 expect(JSON.parse(ld!).some((item:{'@type':string})=>item['@type']==='HowTo')).toBe(true);
 await page.goto('/components/awnings/');
 await expect(page.locator('.related-howto')).toContainText('Automate old awnings');
 const draft=await page.goto('/how-to/see-power-consumption/');expect(draft?.status()).toBe(404);
});
