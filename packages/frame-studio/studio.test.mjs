import {test} from 'node:test';import assert from 'node:assert/strict';import {Window} from 'happy-dom';
const win=new Window({url:'http://frame.test'});for(const key of ['window','document','customElements','HTMLElement','CustomEvent','Event','PointerEvent','ResizeObserver'])globalThis[key]=key==='window'?win:win[key];
const {FrameStudio}=await import('./studio.js');const {BUILTINS}=await import('./contract.js');
function mount(){const e=new FrameStudio();e.profile={installationId:Math.random().toString()};e.endpoint='panel';e.endpoints=[{id:'panel',name:'Panel'}];e.library={revision:'0',templates:{a:{config:structuredClone(BUILTINS.blank),revision:1,builtin:false}},applied:{}};e._hass={user:{id:'admin'}};e.selectTemplate('a');document.body.append(e);return e;}
test.afterEach(()=>document.body.replaceChildren());
test('Save as new forks draft history and later edits do not leak back to original',async()=>{const e=mount();e.draft.change(c=>c.name='Copy');e.poll=async()=>{};e._hass.callWS=async()=>({revision:'1',templates:{...e.library.templates,b:{config:structuredClone(e.draft.config),revision:1,builtin:false}},applied:{}});await e.mutate('save',{templateId:'b',config:e.draft.config});e.draft.change(c=>c.name='Only B');e.selectTemplate('a');assert.equal(e.draft.config.name,'Blank');e.selectTemplate('b');assert.equal(e.draft.config.name,'Only B');e.draft.undo();assert.equal(e.draft.config.name,'Copy');e.selectTemplate('a');assert.equal(e.draft.config.name,'Blank');});
test('disconnect while preview request is pending does not block a new poll',async()=>{const e=mount();let resolve;let calls=0;e._hass.callWS=()=>{calls++;return new Promise(r=>resolve=r);};const pending=e.poll();assert.equal(calls,1);e.remove();document.body.append(e);resolve(null);await pending;e._hass.callWS=async()=>{calls++;throw Error('offline');};await e.poll();assert.equal(calls,2);assert.equal(e.polling,false);});
test('library separates Ready and Needs mapping without preventing placement',()=>{const e=mount();e.mapping={widgets:{clock:{ready:true,reasons:[]},rooms:{ready:false,reasons:['Select a temperature sensor.']}}};e.render();assert.match(e.catalog.textContent,/Ready/);assert.match(e.catalog.textContent,/Needs mapping/);assert.match(e.catalog.textContent,/Select a temperature sensor/);const room=e.catalog.querySelector('[data-widget="rooms"]');assert.equal(room.disabled,false);assert.ok(e.catalog.querySelector('[data-map="rooms"]'));e.readinessFilter='ready';e.populateLibrary(e.catalog);assert.equal(e.catalog.querySelector('[data-widget="rooms"]'),null);assert.ok(e.catalog.querySelector('[data-widget="clock"]'));});
test('mapping save uses its revision, refreshes sources and leaves template draft untouched',async()=>{const e=mount();e.mapping={revision:'mapping-1',mappings:{weather:null},candidates:{weather:[{entity:'weather.home',label:'Home'}]},widgets:{}};e.openMapping('weather');const draft=JSON.stringify(e.draft.config);e.mappingDraft.weather='weather.home';const calls=[];e._hass.callWS=async msg=>{calls.push(msg);return {revision:'mapping-2',mappings:{weather:'weather.home'},candidates:{},widgets:{weather:{ready:true,reasons:[]}}};};e.poll=async()=>calls.push('refresh');await e.saveMapping();assert.equal(calls[0].type,'domosenso_frame/studio_mappings_update');assert.deepEqual(calls[0].patch,{weather:'weather.home'});assert.equal(calls[0].revision,'mapping-1');assert.equal(calls.at(-1),'refresh');assert.equal(e.mapping.revision,'mapping-2');assert.equal(JSON.stringify(e.draft.config),draft);});
test('source editor never preselects an ambiguous candidate and retains input after conflict',async()=>{const e=mount();e.mapping={revision:'m1',mappings:{weather:null},candidates:{weather:[{entity:'weather.a',label:'A'},{entity:'weather.b',label:'B'}]},widgets:{}};e.openMapping('weather');assert.equal(e.shadowRoot.querySelector('[aria-label="Weather source"]').value,'');e.mappingDraft.weather='weather.b';e._hass.callWS=async()=>{throw Error('Source mappings changed');};await e.saveMapping();assert.equal(e.mappingDraft.weather,'weather.b');assert.match(e.error,/Source mappings changed/);});

function musicMapping(studio, locale = 'en') {
 const config = studio.library.templates[studio.tid].config;
 config.locale = locale;
 studio.draft.config.locale = locale;
 studio.endpoints[0].capabilitiesVersion = 1;
 studio.endpoints[0].hifisyncStudioVersion = 1;
 studio.mapping = {
  revision: 'music-1', hifisyncInstalled: true, widgets: {},
  mappings: {media: {entity: 'media_player.library'}, hifisync: true},
  candidates: {media: [
   {entity: 'media_player.library', label: 'Library', hifisyncLink: {status:'ready',systemName:'Demo set',roomName:'Demo room'}},
   {entity: 'media_player.study', label: 'Study', hifisyncLink: {status:'ready',systemName:'Study set',roomName:null}},
   {entity: 'media_player.den', label: 'Den', hifisyncLink: {status:'reauth',systemName:null,roomName:null}},
   {entity: 'media_player.kitchen', label: 'Kitchen'},
  ]},
 };
 studio.openMapping('media');
}

test('Music Sources shows PL/EN HiFiSync details for the selected draft player', () => {
 for (const [locale, playerLabel, toggle, missing, repair] of [
  ['en', 'Media player', 'Show System and Room', 'No room linked', 'Reconnect HiFiSync in Home Assistant'],
  ['pl', 'Odtwarzacz', 'Pokaż System i Pokój', 'Brak przypisanego pokoju', 'Połącz ponownie HiFiSync w Home Assistant'],
 ]) {
  const studio = mount();
  musicMapping(studio,locale);
  const root = studio.shadowRoot;
  const select = entity => {
   const player = root.querySelector(`[aria-label="${playerLabel}"]`);
   player.value = entity;
   player.dispatchEvent(new Event('change'));
  };
  assert.match(root.querySelector('.hifisync-link').textContent, /Demo set.*Demo room/s);
  assert.equal(root.querySelector(`[aria-label="${toggle}"]`).checked,true);
  select('media_player.study');
  assert.ok(root.querySelector('.hifisync-link').textContent.includes(missing));
  assert.match(root.querySelector('.hifisync-link').textContent,/Study set/);
  assert.doesNotMatch(root.querySelector('.hifisync-link').textContent,/Demo room/);
  select('media_player.den');
  assert.equal(root.querySelector('.hifisync-link a').textContent,repair);
  assert.equal(root.querySelector(`[aria-label="${toggle}"]`).disabled,false);
  select('media_player.kitchen');
  assert.doesNotMatch(root.querySelector('.hifisync-link').textContent,/Study set|Demo room|Demo set/);
  studio.remove();
 }
});

test('Music Sources saves player and panel preference without writing a dirty template', async () => {
 const studio = mount();
 musicMapping(studio);
 studio.draft.change(config => {config.name = 'Unsaved custom layout';});
 const saved = JSON.stringify(studio.library);
 const player = studio.shadowRoot.querySelector('[aria-label="Media player"]');
 player.value = 'media_player.study';
 player.dispatchEvent(new Event('change'));
 const toggle = studio.shadowRoot.querySelector('[aria-label="Show System and Room"]');
 toggle.checked = false;
 toggle.dispatchEvent(new Event('change'));
 const calls = [];
 studio._hass.callWS = async message => {
  calls.push(message);
  return {...studio.mapping,revision:'music-2',mappings:message.patch};
 };
 studio.poll=async()=>{};
 await studio.saveMapping();
 assert.deepEqual(calls,[{type:'domosenso_frame/studio_mappings_update',endpoint:'panel',version:1,
  hifisyncStudioVersion:1,revision:'music-1',patch:{media:{entity:'media_player.study'},hifisync:false}}]);
 assert.equal(studio.draft.config.name,'Unsaved custom layout');
 assert.equal(JSON.stringify(studio.library),saved);
});

test('stale Music Sources requests cannot restore a previous frame’s names after returning to it', async () => {
 const studio = mount();
 musicMapping(studio);
 studio.endpoints.push({id:'other',name:'Other',capabilitiesVersion:1,hifisyncStudioVersion:1});
 studio.library.applied={panel:{templateId:'a'},other:{templateId:'a'}};
 studio.render();
 const pending = [];
 studio._hass.callWS = message => new Promise(resolve=>pending.push({resolve,message}));
 const first = studio.loadMappings();
 const mapping = studio.mapping;
 const choose = id => {
  const frames = studio.shadowRoot.querySelector('[aria-label="Frame"]');
  frames.value = id;
  frames.dispatchEvent(new Event('change'));
 };
 studio.poll=async()=>{};
 choose('other');
 assert.equal(studio.shadowRoot.querySelector('.hifisync-link'),null);
 choose('panel');
 pending[2].resolve({...mapping,revision:'current'});
 await new Promise(resolve=>setImmediate(resolve));
 pending[0].resolve({...mapping,revision:'old'});
 await first;
 pending[1].resolve({...mapping,revision:'other'});
 assert.equal(studio.mapping.revision,'current');
 assert.ok(pending.every(({message})=>message.hifisyncStudioVersion===1));
});

test('Music Sources hides uninstalled HiFiSync while leaving the player selector available',()=>{
 const studio=mount();
 musicMapping(studio);
 studio.mapping.hifisyncInstalled=false;
 studio.mapping.mappings.hifisync=false;
 studio.openMapping('media');
 assert.ok(studio.shadowRoot.querySelector('[aria-label="Media player"]'));
 assert.equal(studio.shadowRoot.querySelector('.hifisync-link'),null);
});
