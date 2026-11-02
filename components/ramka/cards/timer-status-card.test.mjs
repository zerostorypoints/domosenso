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
