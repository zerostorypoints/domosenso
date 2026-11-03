import {test} from 'node:test';
import assert from 'node:assert/strict';
import './testing/dom-env.mjs';
import {remainingAt} from './timer-status-card.js';

test('active countdown is anchored once then uses monotonic elapsed time',()=>{
 const sample={state:'active',remaining:65,at:1000};
 assert.equal(remainingAt(sample,6000),60);
 assert.equal(remainingAt(sample,100000),0);
 assert.equal(remainingAt(sample,0),65);
});
test('paused countdown stays fixed and invalid readings are unknown',()=>{
 assert.equal(remainingAt({state:'paused',remaining:65,at:1000},70000),65);
 assert.equal(remainingAt({state:'active',remaining:NaN,at:1000},3000),null);
});
test('labels are text, click uses existing HA more-info, disconnect removes interval',()=>{
 const card=document.createElement('timer-status-card');
 card.setConfig({timers:[{entity:'timer.demo',label:'<img src=x>'}]});
 document.body.append(card);
 card.hass={language:'en',states:{'timer.demo':{state:'paused',attributes:{remaining:'0:01:05'}}}};
 assert.equal(card.shadowRoot.querySelector('img'),null);
 assert.match(card.shadowRoot.textContent,/<img src=x>/);
 assert.match(card.shadowRoot.textContent,/1:05/);
 let detail;card.addEventListener('hass-more-info',e=>detail=e.detail);
 card.shadowRoot.querySelector('button').click();
 assert.deepEqual(detail,{entityId:'timer.demo'});
 card.remove();assert.equal(card._tick,null);
});
test('idle is hidden, unavailable stays explicit, native host never enables browser sound',()=>{
 const card=document.createElement('timer-status-card');
 card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});document.body.append(card);
 card.hass={language:'en',states:{'timer.demo':{state:'idle',attributes:{}}}};
 assert.equal(card.shadowRoot.querySelector('.timer'),null);
 card.hass={language:'en',states:{}};
 assert.match(card.shadowRoot.textContent,/Unavailable/);
 window.ReactNativeWebView={postMessage(){}};
 card.hass={language:'en',states:{'timer.demo':{state:'active',attributes:{finishes_at:new Date(Date.now()+30000).toISOString()}}}};
 assert.equal(card.shadowRoot.querySelector('.sound'),null);
 delete window.ReactNativeWebView;card.remove();
});

test('countdown ticks preserve keyboard focus and unavailable retained attributes do not look current',(t)=>{
 const card=document.createElement('timer-status-card');card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});document.body.append(card);t.after(()=>card.remove());
 card.hass={language:'en',states:{'timer.demo':{state:'paused',attributes:{remaining:'0:01:05'}}}};
 const button=card.shadowRoot.querySelector('.timer');button.focus();card._render();
 assert.equal(card.shadowRoot.querySelector('.timer'),button);
 assert.equal(card.shadowRoot.activeElement,button);
 card.hass={language:'en',states:{'timer.demo':{state:'unavailable',attributes:{remaining:'0:01:05'}}}};
 assert.match(card.shadowRoot.textContent,/Unavailable/);assert.doesNotMatch(button.textContent,/1:05/);card.remove();
});
test('disconnection is shown alongside last confirmed active countdown',(t)=>{
 const card=document.createElement('timer-status-card');card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});document.body.append(card);t.after(()=>card.remove());
 card.hass={language:'en',connection:{connected:false},states:{'timer.demo':{state:'paused',attributes:{remaining:'0:01:05'}}}};
 assert.match(card.shadowRoot.textContent,/Offline/);card.remove();
});

test('server remaining wins over a tablet wall clock offset',async(t)=>{
 const card=document.createElement('timer-status-card');
 card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});
 document.body.append(card);t.after(()=>card.remove());
 t.mock.method(Date,'now',()=>Date.parse('2040-01-01T00:00:00Z'));
 card.hass={language:'en',connection:{connected:true},states:{'timer.demo':{state:'active',attributes:{finishes_at:'2026-11-02T12:01:05Z'}}},
   callWS:async request=>{
     assert.equal(request.type,'domosenso_frame/timer_browser_snapshot');
     assert.deepEqual(request.entities,['timer.demo']);
     return {version:1,asOf:'2026-11-02T12:00:00Z',installationId:'test-installation',timers:[{entity:'timer.demo',label:'Timer',timer:{id:'timer-fact',subjectId:'subject',state:'active',durationSeconds:65,remainingSeconds:65,deadline:'2026-11-02T12:01:05Z',runId:'run',stateRevision:'revision',outcome:'none',alarmDeviceId:null,acknowledged:false,evidenceRefs:[]}}]};
   }};
 await new Promise(resolve=>setImmediate(resolve));
 assert.match(card.shadowRoot.querySelector('.timer').textContent,/1:05/);
});

const browserFact=(overrides={})=>({id:'fact',subjectId:'subject',state:'idle',durationSeconds:65,remainingSeconds:0,deadline:'2026-11-02T11:59:55Z',runId:'run',stateRevision:'revision',outcome:'completed',alarmDeviceId:null,acknowledged:false,evidenceRefs:[],...overrides});
const browserSnapshot=timer=>({version:1,asOf:'2026-11-02T12:00:00Z',installationId:'installation',timers:[{entity:'timer.demo',label:'<img src=x>',timer}]});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
function browserCard(t,{language='en',timer=browserFact()}={}){
 const card=document.createElement('timer-status-card');card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});
 const output={unlocks:0,plays:0,stops:0,async unlockAudioContext(){this.unlocks++;return true;},play(){this.plays++;return true;},stop(){this.stops++;},close(){}};
 card._browser.sound=output;const calls=[];
 card.hass={language,connection:{connected:true},states:{'timer.demo':{state:timer.state,attributes:{}}},callWS:async r=>{calls.push(r);return r.type.endsWith('_snapshot')?browserSnapshot(timer):{version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer};}};
 document.body.append(card);t.after(()=>card.remove());return {card,output,calls};
}
test('real badge click opts into sound, preserves focus, and dismisses through exact browser ack',async t=>{
 const {card,output,calls}=browserCard(t);await settle();assert.equal(output.plays,0);
 assert.equal(card.shadowRoot.querySelector('img'),null);
 const sound=card.shadowRoot.querySelector('.sound');assert.match(sound.textContent,/foreground only.*no background alarm/);
 sound.focus();sound.click();await settle();assert.equal(output.unlocks,1);assert.equal(output.plays,1);
 card._render();assert.equal(card.shadowRoot.activeElement,sound);assert.equal(sound.getAttribute('aria-pressed'),'true');
 card.shadowRoot.querySelector('.dismiss').click();await settle();assert.equal(card._browser.playing,null);
 assert.deepEqual(calls.find(r=>r.type.endsWith('_acknowledge')),{type:'domosenso_frame/timer_browser_acknowledge',version:1,subjectId:'subject',runId:'run'});
});
test('native handshake before document hides opt-in and routes dismiss to host',async t=>{
 window.__domosensoFrameTimerHost={version:1,managed:true};t.after(()=>delete window.__domosensoFrameTimerHost);
 const {card,output,calls}=browserCard(t);await settle();assert.equal(card.shadowRoot.querySelector('.sound'),null);
 let detail;const listener=e=>{detail=e.detail;};window.addEventListener('domosenso-frame-timer-dismiss',listener);t.after(()=>window.removeEventListener('domosenso-frame-timer-dismiss',listener));
 card.shadowRoot.querySelector('.dismiss').click();await settle();assert.deepEqual(detail,{subjectId:'subject',runId:'run'});
 assert.equal(output.plays,0);assert.equal(calls.some(r=>!r.type.endsWith('_snapshot')),false);
});
test('native handshake during output stops sound and removes opt-in without replacing helper button',async t=>{
 const {card,output}=browserCard(t);await settle();const helper=card.shadowRoot.querySelector('.timer');
 card.shadowRoot.querySelector('.sound').click();await settle();assert.equal(output.plays,1);
 window.dispatchEvent(new window.CustomEvent('domosenso-frame-timer-host',{detail:{version:1,managed:true}}));
 assert.equal(card._browser.playing,null);assert.equal(card.shadowRoot.querySelector('.sound'),null);assert.equal(card.shadowRoot.querySelector('.timer'),helper);
});
for(const language of ['en','de','pl'])test(`timer foreground warning and completion are translated in ${language}`,async t=>{
 const {card}=browserCard(t,{language,timer:browserFact({outcome:'inferred_completed'})});await settle();
 assert.doesNotMatch(card.shadowRoot.textContent,/card\.timers\./);
 const warning=card.shadowRoot.querySelector('.sound').textContent;
 assert.match(warning,language==='en'?/no background alarm/:language==='de'?/kein Hintergrundalarm/:/bez alarmu w tle/);
});
test('bridge absent keeps active count unavailable and core more-info usable',async t=>{
 const card=document.createElement('timer-status-card');card.setConfig({timers:[{entity:'timer.demo',label:'Timer'}]});document.body.append(card);t.after(()=>card.remove());
 card.hass={states:{'timer.demo':{state:'active',attributes:{finishes_at:'2040-01-01T00:00:00Z'}}},callWS:async()=>{throw Error('unknown_command');}};await settle();
 assert.match(card.shadowRoot.querySelector('.timer').textContent,/Unavailable/);assert.equal(card.shadowRoot.querySelector('.sound'),null);
 let opened=false;card.addEventListener('hass-more-info',()=>{opened=true;});card.shadowRoot.querySelector('.timer').click();assert.equal(opened,true);
});
