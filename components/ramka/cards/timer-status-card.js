import en from '../translations/en.json' with { type: 'json' };
import de from '../translations/de.json' with { type: 'json' };
import pl from '../translations/pl.json' with { type: 'json' };
import {createT} from './lib/i18n.js';
const t=createT({en,de,pl});

export function remainingAt(sample, now) {
  if (!sample || !Number.isFinite(sample.remaining) || sample.remaining < 0) return null;
  return Math.max(0, Math.ceil(sample.remaining - (sample.state === 'active' ? Math.max(0,now-sample.at)/1000 : 0)));
}
function duration(value) {
  if(typeof value !== 'string' || !/^\d+:\d{2}:\d{2}$/.test(value)) return null;
  const [h,m,s]=value.split(':').map(Number);
  return m<60 && s<60 ? h*3600+m*60+s : null;
}
function time(value) {
  const seconds=Math.max(0,Math.ceil(value));
  return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
}

// This badge only displays core helper state. Starting, editing and cancelling stays in HA's
// standard timer dialog; native alarm ownership belongs to the paired host, never this card.
class TimerStatusCard extends HTMLElement {
  constructor(){super();this.attachShadow({mode:'open'});this._samples=new Map();this._tick=null;}
  setConfig(config){
    if(!Array.isArray(config.timers) || config.timers.length>16 || config.timers.some(x=>!/^timer\.[a-z0-9_]+$/.test(x.entity) || typeof x.label!=='string')) throw Error('Invalid timer mapping');
    this._config=config;this._samples.clear();this._render();
  }
  connectedCallback(){
    if(!this._tick)this._tick=setInterval(()=>this._render(),1000);
    this._render();
  }
  disconnectedCallback(){clearInterval(this._tick);this._tick=null;}
  set hass(hass){
    this._hass=hass;
    for(const item of this._config?.timers||[]){
      const state=hass.states?.[item.entity], attr=state?.attributes||{};
      const revision=JSON.stringify([state?.state,state?.last_changed,attr.finishes_at,attr.remaining]);
      if(this._samples.get(item.entity)?.revision===revision)continue;
      const remaining=state?.state==='active' && typeof attr.finishes_at==='string' ?
        Math.max(0,(Date.parse(attr.finishes_at)-Date.now())/1000):duration(attr.remaining);
      this._samples.set(item.entity,{revision,state:state?.state||'unavailable',remaining:remaining??NaN,at:performance.now()});
    }
    this._render();
  }
  _render(){
    if(!this.shadowRoot.querySelector('.timers'))this.shadowRoot.innerHTML=`<style>:host{position:fixed;bottom:12px;left:12px;z-index:5;max-width:calc(100vw - 120px);pointer-events:none} .timers{display:flex;flex-wrap:wrap;gap:6px;max-height:20vh;overflow:auto}.timer{pointer-events:auto;border:1px solid var(--divider-color,#666);border-radius:20px;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);padding:7px 12px;font:inherit;min-height:40px;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.timer:focus-visible{outline:2px solid var(--primary-color,#03a9f4)}</style><div class="timers"></div>`;
    const root=this.shadowRoot.querySelector('.timers');
    const shown=new Set();
    for(const item of this._config?.timers||[]){
      const sample=this._samples.get(item.entity);if(!sample || sample.state==='idle')continue;
      const seconds=['active','paused'].includes(sample.state)?remainingAt(sample,performance.now()):null;
      const label=seconds===null?t(this._hass,'card.timers.unavailable'):time(seconds)+(sample.state==='paused'?' · '+t(this._hass,'card.timers.paused'):'');
      shown.add(item.entity);
      let button=[...root.children].find(el=>el.dataset.entity===item.entity);
      if(!button){
        button=document.createElement('button');button.className='timer';button.type='button';button.dataset.entity=item.entity;
        button.addEventListener('click',()=>this.dispatchEvent(new window.CustomEvent('hass-more-info',{detail:{entityId:item.entity},bubbles:true,composed:true})));
        root.append(button);
      }
      button.textContent=item.label+' · '+label+(this._hass?.connection?.connected===false?' · '+t(this._hass,'card.timers.offline'):'');
    }
    for(const button of [...root.children])if(!shown.has(button.dataset.entity))button.remove();
  }
  getCardSize(){return 0;}
  getGridOptions(){return {columns:0,rows:0};}
}
if(!customElements.get('timer-status-card'))customElements.define('timer-status-card',TimerStatusCard);
