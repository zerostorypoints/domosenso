import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {BUILTINS,REGISTRY,validateConfig,positions,migrate,place} from './contract.js';

test('built-ins cover every implemented registry widget and fit both grids',()=>{
 const types=new Set();
 for(const config of Object.values(BUILTINS)){validateConfig(config);for(const m of config.modes)for(const s of m.screens){positions(s,true);for(const w of s.widgets)types.add(w.type);}}
 assert.deepEqual([...types].sort(),Object.keys(REGISTRY).sort());
});
test('rejects unknown options, overlap, boundaries, booleans and missing states',()=>{
 for(const mutate of [c=>c.modes.pop(),c=>c.extra='x',c=>c.modes[0].screens[0].widgets[0].layout.x=true,c=>c.modes[0].screens[0].widgets[0].options={entity:'sensor.secret'},c=>c.modes[0].screens[0].widgets.push({...c.modes[0].screens[0].widgets[0],id:'collision'}),c=>c.modes[0].screens[0].widgets[0].layout.w=13]){const c=structuredClone(BUILTINS.blank);mutate(c);assert.throws(()=>validateConfig(c));}
});
test('move/resize snaps scaled pointer coordinates once and rejects collision',()=>{
 const s={widgets:[{id:'a',type:'clock',layout:{x:0,y:0,w:4,h:4}},{id:'b',type:'clock',layout:{x:8,y:0,w:4,h:4}}]};
 assert.deepEqual(place(s,'a',{x:4.2,y:1.1,w:4,h:4},false),{x:4,y:1,w:4,h:4});
 assert.equal(place(s,'a',{x:7,y:0,w:4,h:4},false),null);
 assert.equal(place(s,'a',{x:-1,y:0,w:4,h:4},false),null);
});
test('portrait overrides preserve landscape; invalid mixed override rejected',()=>{
 const c=structuredClone(BUILTINS.classic),s=c.modes[1].screens[0];const before=structuredClone(s.widgets[0].layout);const p=positions(s,true);
 s.widgets[0].portrait=p[0];validateConfig(c);assert.deepEqual(s.widgets[0].layout,before);
 s.widgets[0].portrait={x:0,y:20,w:12,h:4};assert.throws(()=>validateConfig(c));
});
test('v1 migration retains order, widgets, locale and durations independently per state',()=>{
 const c=migrate({version:1,locale:'pl',screens:[{id:'home',title:'Home',widgets:[{id:'clock',type:'clock',size:'small'},{id:'air',type:'measurements',topic:'air',size:'wide'}]}],modes:[{id:'controls',screens:['home'],rotationSeconds:30},{id:'ambient',screens:['home'],rotationSeconds:15},{id:'media',screens:['home'],rotationSeconds:0}]},'Imported');
 validateConfig(c);assert.equal(c.locale,'pl');assert.equal(c.modes[1].screens[0].duration,15);assert.equal(c.modes[0].screens[0].widgets[1].type,'air');
 c.modes[0].screens[0].title='Changed';assert.equal(c.modes[1].screens[0].title,'Home');
});

test('HiFiSync widget schema accepts the same options as the registry',()=>{
 const schema=JSON.parse(readFileSync(new URL('./schema.json',import.meta.url),'utf8'));
 const variants=schema.properties.modes.items.properties.screens.items.properties.widgets.items.oneOf;
 for(const type of ['hifisync-system','hifisync-room']){
  const options=variants.find(variant=>variant.properties.type.const===type).properties.options;
  assert.deepEqual(Object.keys(options.properties),Object.keys(REGISTRY[type].options));
 }
});
