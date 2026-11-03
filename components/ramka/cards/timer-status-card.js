import en from '../translations/en.json' with { type: 'json' };
import de from '../translations/de.json' with { type: 'json' };
import pl from '../translations/pl.json' with { type: 'json' };
import {createT} from './lib/i18n.js';
import {TimerBrowser, remainingAt} from './timer-browser.js';
const t=createT({en,de,pl});
export {remainingAt} from './timer-browser.js';

function duration(value) {
  if(typeof value !== 'string' || !/^\d+:\d{2}:\d{2}$/.test(value)) return null;
  const [h,m,s]=value.split(':').map(Number);
  return m<60 && s<60 ? h*3600+m*60+s : null;
}
function time(value) {
  const seconds=Math.max(0,Math.ceil(value));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}

// The badge composes HA's existing helper dialog. Browser sound is foreground-only;
// server claims and the managed native-host handshake decide who may produce it.
class TimerStatusCard extends HTMLElement {
  constructor(){
    super();this.attachShadow({mode:'open'});this._tick=null;
    this._browser=new TimerBrowser({onChange:()=>this._render()});
  }
  setConfig(config){
    if(!Array.isArray(config.timers) || config.timers.some(x=>!x || typeof x.label!=='string')) throw Error('Invalid timer mapping');
    this._browser.configure(config.timers.map(x=>x.entity));
    this._config={...config,timers:config.timers.map(x=>({...x}))};this._render();
  }
  connectedCallback(){
    this._browser.connect();
    if(!this._tick)this._tick=setInterval(()=>this._render(),1000);
    this._render();
  }
  disconnectedCallback(){
    clearInterval(this._tick);this._tick=null;this._browser.disconnect();
  }
  set hass(hass){this._hass=hass;this._browser.updateHass(hass);this._render();}
  _render(){
    if(!this.shadowRoot.querySelector('.timers'))this.shadowRoot.innerHTML=`<style>:host{position:fixed;bottom:12px;left:12px;z-index:5;max-width:calc(100vw - 120px);pointer-events:none} .timers{display:flex;flex-wrap:wrap;gap:6px;max-height:20vh;overflow:auto}.timer-row{display:flex;max-width:100%;gap:4px}button{pointer-events:auto;border:1px solid var(--divider-color,#666);border-radius:20px;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);padding:7px 12px;font:inherit;min-height:40px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}button:focus-visible{outline:2px solid var(--primary-color,#03a9f4)}.sound{white-space:normal}button:disabled{opacity:.6}</style><div class="timers"></div>`;
    const root=this.shadowRoot.querySelector('.timers'),shown=new Set();
    for(const item of this._config?.timers||[]){
      const sample=this._browser.samples.get(item.entity),core=this._hass?.states?.[item.entity];
      const state=sample?.state ?? core?.state ?? 'unknown';
      const fact=sample?.timer;
      const completed=fact?.state==='idle' && ['completed','inferred_completed'].includes(fact.outcome);
      if(state==='idle' && (!completed || fact.acknowledged))continue;
      // Core paused remaining is a duration; an active core deadline needs server time.
      const seconds=sample ? (['active','paused'].includes(state)?remainingAt(sample,performance.now()):null) :
        (state==='paused'?duration(core?.attributes?.remaining):null);
      let label=seconds===null?t(this._hass,'card.timers.unavailable'):time(seconds)+(state==='paused'?' · '+t(this._hass,'card.timers.paused'):'');
      if(completed)label=t(this._hass,fact.outcome==='inferred_completed'?'card.timers.inferred_completed':'card.timers.completed');
      if(!this._browser.online)label+=' · '+t(this._hass,'card.timers.offline');
      shown.add(item.entity);
      let row=[...root.children].find(el=>el.dataset.entity===item.entity);
      if(!row){
        row=document.createElement('div');row.className='timer-row';row.dataset.entity=item.entity;
        const button=document.createElement('button');button.className='timer';button.type='button';
        button.addEventListener('click',()=>this.dispatchEvent(new window.CustomEvent('hass-more-info',{detail:{entityId:item.entity},bubbles:true,composed:true})));
        row.append(button);root.append(row);
      }
      const name=sample?.label ?? item.label;
      row.querySelector('.timer').textContent=name+' · '+label;
      let dismiss=row.querySelector('.dismiss');
      if(completed && !fact.acknowledged){
        if(!dismiss){
          dismiss=document.createElement('button');dismiss.type='button';dismiss.className='dismiss';
          dismiss.addEventListener('click',()=>this._browser.dismiss(dismiss.dataset.subject,dismiss.dataset.run));row.append(dismiss);
        }
        dismiss.dataset.subject=fact.subjectId;dismiss.dataset.run=fact.runId;
        dismiss.textContent=t(this._hass,'card.timers.dismiss');
        dismiss.setAttribute('aria-label',t(this._hass,'card.timers.dismiss')+' · '+name);
        dismiss.disabled=!this._browser.online && !this._browser.managed;
      }else dismiss?.remove();
    }
    for(const row of [...root.children])if(row.dataset.entity && !shown.has(row.dataset.entity))row.remove();
    let sound=root.querySelector('.sound');
    const canOptIn=!this._browser.managed && this._browser.available && [...this._browser.samples.values()].some(s=>s.timer.alarmDeviceId===null);
    if(canOptIn){
      if(!sound){
        sound=document.createElement('button');sound.type='button';sound.className='sound';
        sound.addEventListener('click',()=>{if(this._browser.enabled)this._browser.disableSound();else void this._browser.enableSound();});root.append(sound);
      }
      sound.textContent=t(this._hass,this._browser.enabled?'card.timers.sound_enabled':'card.timers.sound_enable');
      sound.setAttribute('aria-pressed',String(this._browser.enabled));
      sound.disabled=!this._browser.online;
    }else sound?.remove();
  }
  getCardSize(){return 0;}
  getGridOptions(){return {columns:0,rows:0};}
}
if(!customElements.get('timer-status-card'))customElements.define('timer-status-card',TimerStatusCard);
