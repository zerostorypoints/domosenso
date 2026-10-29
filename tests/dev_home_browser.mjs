// Actual HA frontend acceptance, invoked by dev-home.py check (no real-home URL accepted).
import assert from 'node:assert/strict';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {resolve, join} from 'node:path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';

const runtime = resolve(process.argv[2] || 'missing-runtime');
const owner = JSON.parse(await readFile(join(runtime, 'owner.json')));
assert.equal(runtime, join(owner.root, '.domosenso/dev', owner.identity));
const info = JSON.parse(await readFile(join(runtime, 'runtime.json')));
const tokens = JSON.parse(await readFile(join(runtime, 'auth.json')));
const origin = `http://127.0.0.1:${info.port}`;
assert.equal(tokens.hassUrl, origin);
const container = `domosenso-dev-${owner.identity}`;
function docker(...args) { return execFileSync('docker', args, {encoding:'utf8', timeout:45000}); }
const inspected = JSON.parse(docker('inspect', container))[0];
assert.equal(inspected.Config.Labels['org.domosenso.dev.identity'], owner.identity);
assert.equal(inspected.Config.Labels['org.domosenso.dev.root'], owner.root);
const require = createRequire(new URL('../website/package.json', import.meta.url));
const {chromium} = require('playwright');
const output = join(runtime, 'screenshots'); await mkdir(output, {recursive:true});
const report = {cases:[], browserErrors:[], knownIssues:[]};
const browser = await chromium.launch({headless:true});

async function api(path, data) {
  const response = await fetch(origin+path, {method:data === undefined?'GET':'POST',
    headers:{Authorization:`Bearer ${tokens.access_token}`, 'Content-Type':'application/json'},
    body:data === undefined?undefined:JSON.stringify(data), signal:AbortSignal.timeout(6000)});
  if(!response.ok) throw new Error(`${path}: HTTP ${response.status} ${await response.text()}`);
  return response.json();
}
async function service(domain, name, data) { return api(`/api/services/${domain}/${name}`,data); }
async function helper(suffix,value) { await service('input_select','select_option',{entity_id:`input_select.ramka_${suffix}`,option:value}); }
async function ready(timeout=90000) {
  const end=Date.now()+timeout;
  while(Date.now()<end) { try { await api('/api/'); return; } catch { await new Promise(r=>setTimeout(r,500)); } }
  throw new Error('HA restart readiness timeout');
}
async function visible(page, selector) {
  await page.locator(selector).filter({visible:true}).first().waitFor({state:'visible',timeout:20000});
  return page.locator(selector).filter({visible:true}).first();
}
async function newPage(lang,viewport) {
  const context=await browser.newContext({viewport, locale:lang==='de'?'de-CH':lang==='pl'?'pl-PL':'en-GB'});
  await context.addInitScript(({tokens,lang})=>{
    localStorage.setItem('hassTokens',JSON.stringify(tokens));
    localStorage.setItem('selectedLanguage',JSON.stringify(lang));
    localStorage.setItem('dockedSidebar',JSON.stringify('always_hidden'));
  },{tokens,lang});
  const page=await context.newPage();
  page.on('pageerror',error=>report.browserErrors.push({lang,message:error.message}));
  await page.goto(origin+`/dashboard-ramka-${lang}/ramka?disable_km`);
  await page.waitForFunction(()=>document.querySelector('home-assistant')?.hass?.connected,undefined,{timeout:30000});
  assert.equal(await page.evaluate(()=>document.querySelector('home-assistant').hass.locale.language),lang);
  await page.getByText('Loading...', {exact:true}).waitFor({state:'hidden',timeout:15000});
  // HA fades its launch overlay after the first cards have connected.
  await page.waitForTimeout(1000);
  return {context,page};
}
async function uiLightToggle(page) {
  let target;
  const deadline=Date.now()+15000;
  while(!target && Date.now()<deadline) {
    const tiles=page.locator('hui-tile-card').filter({visible:true});
    for(let index=0;index<await tiles.count();index++) {
      if(await tiles.nth(index).evaluate(el=>el._config?.entity)==='light.living_room') { target=tiles.nth(index); break; }
    }
    if(!target) await page.waitForTimeout(100);
  }
  assert(target,'real light tile is absent');
  const before=(await api('/api/states/light.living_room')).state;
  // The tile icon is HA's actual toggle action; clicking its body would open more-info.
  await target.locator('ha-tile-icon').click();
  const expected=before==='on'?'off':'on';
  await page.waitForFunction(({expected})=>document.querySelector('home-assistant').hass.states['light.living_room'].state===expected,{expected},{timeout:10000});
  assert.equal((await api('/api/states/light.living_room')).state,expected);
}
try {
  // Explicit UI test tuning, after the fresh-start observation; this is never a component fix.
  for(const [suffix,value] of [['controls_hold_s',600],['off_delay_s',1800]])
    await service('input_number','set_value',{entity_id:`input_number.ramka_${suffix}`,value});
  await service('input_boolean','turn_off',{entity_id:['input_boolean.ramka_near_enabled','input_boolean.ramka_ambient_music']});
  await service('media_player','media_pause',{entity_id:'media_player.living_room_speaker'});
  for(const [device,viewport] of [['desktop',{width:1440,height:1000}],['tablet',{width:1100,height:720}]]) {
    for(const lang of ['en','de','pl']) {
      await helper('mode','ambient'); await helper('ambient','climate');
      const {context,page}=await newPage(lang,viewport);
      const clock=await visible(page,'clock-weather-card');
      await clock.locator('.forecast .day').first().waitFor({state:'visible',timeout:15000});
      assert.equal(await clock.locator('.forecast .day').count(),4);
      await visible(page,'rooms-card');
      assert.equal(await page.locator('hui-error-card').filter({visible:true}).count(),0);
      await page.screenshot({path:join(output,`${device}-${lang}-climate.png`),fullPage:true});
      await helper('mode','controls'); await visible(page,'tap-button-card');
      await uiLightToggle(page);
      await page.screenshot({path:join(output,`${device}-${lang}-controls.png`),fullPage:true});
      await helper('mode','calendar'); const agenda=await visible(page,'agenda-card');
      await agenda.getByText('Dentist',{exact:true}).waitFor({state:'visible',timeout:15000});
      await page.screenshot({path:join(output,`${device}-${lang}-calendar.png`),fullPage:true});
      report.cases.push({case:`${device}/${lang}`,status:'pass',viewport,forecast:4,uiLightToggle:true,calendar:true});
      console.log(`ok ${device}/${lang}: real cards, forecast, light toggle and calendar`);
      await context.close();
    }
  }
  assert.equal(report.browserErrors.length,0,'frontend errors during normal acceptance');
  // Leave one real frontend open across restart. The synthetic weather boundary is delayed
  // once, so reconnect precedes the upstream forecast: the race behind #53, fixed in ramka 0.3.1.
  await helper('mode','ambient'); await helper('ambient','climate');
  const {context,page}=await newPage('en',{width:1100,height:720});
  const clock=await visible(page,'clock-weather-card');
  await clock.locator('.forecast .day').first().waitFor({state:'visible',timeout:15000});
  const navigation=page.url(); let navigations=0;
  page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  const configPath=join(runtime,'config/configuration.yaml');
  const config=await readFile(configPath,'utf8');
  await writeFile(configPath,config.replace('domosenso_demo:\n','domosenso_demo:\n  weather_delay: 20\n'));
  try {
    docker('restart','--timeout','20',container);
    await ready();
    await page.waitForFunction(()=>document.querySelector('home-assistant')?.hass?.connected,undefined,{timeout:60000});
    await page.waitForFunction(()=>document.querySelector('home-assistant')?.hass?.states['weather.forecast_home']?.state !== 'unavailable' && !!document.querySelector('home-assistant')?.hass?.states['weather.forecast_home'],undefined,{timeout:45000});
    const forecastDeadline=Date.now()+45000;
    while(true) {
      try { const response=await api('/api/services/weather/get_forecasts?return_response',{entity_id:'weather.forecast_home',type:'daily'}); if(response.service_response['weather.forecast_home'].forecast.length===5) break; } catch {}
      assert(Date.now()<forecastDeadline,'synthetic weather did not become ready after delay');
      await new Promise(r=>setTimeout(r,500));
    }
    await new Promise(r=>setTimeout(r,1500));
    assert.equal(page.url(),navigation); assert.equal(navigations,0,'frontend reloaded instead of reconnecting');
    // The open page gets its forecast back without a reload (#53).
    const reconnected=(await visible(page,'clock-weather-card')).locator('.forecast .day');
    await reconnected.nth(3).waitFor({state:'visible',timeout:15000}).catch(()=>{});
    const after=await reconnected.count();
    assert.equal(after,4,'forecast not back on the open page after reconnect (#53)');
    await page.screenshot({path:join(output,'tablet-en-reconnected.png'),fullPage:true});
    await helper('mode','controls'); await uiLightToggle(page); await helper('mode','ambient');
    // A new page must receive the forecast once the synthetic upstream is ready.
    const fresh=await newPage('en',{width:1100,height:720});
    const freshClock=await visible(fresh.page,'clock-weather-card');
    await freshClock.locator('.forecast .day').first().waitFor({state:'visible',timeout:15000});
    assert.equal(await freshClock.locator('.forecast .day').count(),4);
    await fresh.context.close();
    report.cases.push({case:'open-page restart',status:'pass',reloaded:false,uiLightToggleAfterReconnect:true,forecastAfterReconnect:after,weatherDelaySeconds:20});
  } finally { await writeFile(configPath,config); }
  await context.close();
} catch(error) {
  report.cases.push({case:'browser acceptance',status:'fail',detail:error.stack});
  console.error(error.stack); process.exitCode=1;
} finally {
  await browser.close();
  await writeFile(join(runtime,'browser.json'),JSON.stringify(report,null,2));
}
