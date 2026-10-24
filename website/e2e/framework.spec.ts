import {test,expect} from '@playwright/test';
test('start a separate home project from the homepage',async({page}, testInfo)=>{
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('Home Assistant');
 await page.screenshot({path:testInfo.outputPath('homepage.png'),fullPage:true});
 await page.getByRole('link',{name:'Start your project',exact:true}).first().click();
 await expect(page).toHaveURL(/get-started/);
 await expect(page.getByRole('heading',{name:'One home. Your own project.'})).toBeVisible();
 await expect(page.getByText('Home Assistant Container', {exact:true}).first()).toBeVisible();
 await expect(page.getByText(/HAOS is not supported/)).toBeVisible();
});
test('catalog distinguishes descriptive integrations and links to immutable source',async({page})=>{
 await page.goto('/components/weather/');
 await expect(page.getByText('Integration guide',{exact:true}).first()).toBeVisible();
 await expect(page.getByRole('link',{name:'View release source'})).toHaveAttribute('href',/github.com\/zerostorypoints\/domosenso\/tree\/[a-f0-9]{40}\//);
});
test('deep links, canonical origin, narrow layout and services bridge',async({page})=>{
 for(const path of ['/','/components/','/components/ramka/','/docs/','/docs/compatibility/','/contribute/','/releases/','/professional-services/']){
  const response=await page.goto(path);expect(response?.status()).toBe(200);
  await expect(page.locator('link[rel=canonical]')).toHaveAttribute('href',`https://domosenso.org${path}`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
 }
 await expect(page.getByRole('link',{name:'Discuss your project'})).toHaveAttribute('href','https://domosenso.com/en/#contact');
 const missing=await page.goto('/missing-component/');expect(missing?.status()).toBe(404);
 await expect(page.getByRole('heading',{level:1})).toHaveText('This page is not in the catalog.');
});
test('keyboard skip link reaches main content',async({page})=>{
 await page.goto('/');await page.keyboard.press('Tab');
 await expect(page.getByRole('link',{name:'Skip to content'})).toBeFocused();
 await page.keyboard.press('Enter');await expect(page.locator('main')).toBeFocused();
});

test('installation annotations expose the component behind each detail', async ({page}) => {
 await page.goto('/');
 await page.getByRole('button',{name:'02 Wake sensor',exact:true}).click();
 await expect(page.getByRole('region',{name:'Installation detail'})).toContainText('radar');
 await page.getByRole('button',{name:'03 Audio view',exact:true}).click();
 const detail=page.getByRole('region',{name:'Installation detail'});
 await expect(detail).toContainText('media');
 await expect(detail.getByRole('link',{name:'Open component'})).toHaveAttribute('href','/components/media/');
 await page.getByRole('button',{name:'01 Wall tablet',exact:true}).click();
 await expect(detail.getByRole('link',{name:'Open component'})).toHaveAttribute('href','/components/ramka/');
});

test('agent path leads from framework explanation to a usable onboarding prompt', async ({page}) => {
 await page.goto('/');
 await expect(page.getByRole('heading',{level:1})).toContainText('Home Assistant');
 await page.getByRole('link',{name:'See how AI helps',exact:true}).click();
 await expect(page.getByRole('heading',{name:'From your devices to a working plan.'})).toBeVisible();
 await page.getByRole('link',{name:'Start with your agent',exact:true}).click();
 await expect(page.getByLabel('Starter prompt')).toContainText('onboard-home');
 await expect(page.getByLabel('Starter prompt')).toContainText('Stop at the deployment plan');
});

test('device requirements retain setup-critical information', async ({page}) => {
 await page.goto('/components/climate-air/');
 await expect(page.getByRole('heading',{name:'What it needs'})).toBeVisible();
 await expect(page.locator('.requirements')).toContainText('Tapo hub (tested: H200)');
 await page.goto('/components/awnings/');
 await expect(page.locator('.requirements')).toContainText('ESPSomfy-RTS');
});

test('mobile navigation closes after moving to another page', async ({page}, testInfo) => {
 test.skip(testInfo.project.name !== 'mobile');
 await page.goto('/');
 await page.getByText('Menu',{exact:false}).first().click();
 await page.getByRole('navigation',{name:'Mobile navigation'}).getByRole('link',{name:'Docs',exact:true}).click();
 await expect(page).toHaveURL(/\/docs\//);
 await expect(page.locator('.mobile-nav')).not.toHaveAttribute('open','');
});


test('selected releases have an explicit license grant and current onboarding status', async ({page}) => {
 await page.goto('/components/ramka/');
 await page.getByRole('link',{name:'License for this release'}).click();
 await expect(page).toHaveURL(/\/docs\/licensing\//);
 await expect(page.locator('main')).toContainText('ZeroStoryPoints GmbH');
 await expect(page.locator('main')).toContainText('ramka/0.2.0');
 await expect(page.locator('main')).toContainText('Apache-2.0');
 await page.goto('/docs/getting-started/');
 await expect(page.locator('main')).toContainText('no published component tag');
 await expect(page.locator('main')).toContainText('ramka/0.2.0');
});
