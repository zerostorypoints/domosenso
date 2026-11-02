import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TimerBrowser, remainingAt} from './timer-browser.js';

const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();};
const defer=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const fact=(overrides={})=>({id:'fact',subjectId:'subject',state:'active',durationSeconds:65,remainingSeconds:65,deadline:'2026-11-02T12:01:05Z',runId:'run',stateRevision:'rev',outcome:'none',alarmDeviceId:null,acknowledged:false,evidenceRefs:[],...overrides});
const finished=(overrides={})=>fact({state:'idle',remainingSeconds:0,deadline:'2026-11-02T11:59:55Z',outcome:'completed',...overrides});
const snapshot=(timer=fact(),entity='timer.demo')=>({version:1,installationId:'installation',asOf:'2026-11-02T12:00:00Z',timers:[{entity,label:'Timer',timer}]});
function setup(t,{timer=fact(),host=false,handler}={}){
 let now=1000,id=0;const jobs=new Map(),calls=[],sound={unlocks:0,plays:[],stops:0,closes:0,
   async unlockAudioContext(){this.unlocks++;return true;},play(seconds){this.plays.push(seconds);return true;},stop(){this.stops++;},close(){this.closes++;}};
 const win=new EventTarget(),doc=new EventTarget();doc.visibilityState='visible';
 if(host)win.__domosensoFrameTimerHost={version:1,managed:true};
 const connection=new EventTarget();connection.connected=true;
 const hass={connection,user:{id:'user'},states:{'timer.demo':{state:timer.state}},callWS:async request=>{
   calls.push(request);
   if(handler)return handler(request);
   if(request.type.endsWith('_snapshot'))return snapshot(timer);
   return {version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer};
 }};
 const schedule=(fn,ms,repeat)=>{jobs.set(++id,{fn,ms,at:now+ms,repeat});return id;};
 const controller=new TimerBrowser({now:()=>now,window:win,document:doc,sound,
   setInterval:(fn,ms)=>schedule(fn,ms,true),clearInterval:n=>jobs.delete(n),
   setTimeout:(fn,ms)=>schedule(fn,ms,false),clearTimeout:n=>jobs.delete(n)});
 controller.configure(['timer.demo']);controller.connect();controller.updateHass(hass);
 t.after(()=>controller.disconnect());
 return {controller,hass,win,doc,sound,calls,jobs,setTimer:value=>{timer=value;},
   async advance(ms){const end=now+ms;while(true){const next=[...jobs].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;
     now=next[1].at;if(next[1].repeat)next[1].at+=next[1].ms;else jobs.delete(next[0]);next[1].fn();await flush();}now=end;await flush();},
   hide(){doc.visibilityState='hidden';doc.dispatchEvent(new Event('visibilitychange'));},
   host(){win.__domosensoFrameTimerHost={version:1,managed:true};const event=new Event('domosenso-frame-timer-host');event.detail=win.__domosensoFrameTimerHost;win.dispatchEvent(event);},
   offline(){connection.connected=false;connection.dispatchEvent(new Event('disconnected'));}};
}

test('snapshot countdown uses monotonic response time, paused remains fixed',async t=>{
 const x=setup(t);await flush();await x.advance(4000);
 assert.equal(remainingAt(x.controller.samples.get('timer.demo'),5000),61);
 x.setTimer(fact({state:'paused',remainingSeconds:42}));x.controller.refresh();await flush();await x.advance(5000);
 assert.equal(remainingAt(x.controller.samples.get('timer.demo'),11000),42);
});
test('snapshot requests are serialized and old mapping responses are discarded',async t=>{
 const pending=defer();let first=true;
 const x=setup(t,{handler:r=>{if(first){first=false;return pending.promise;}return snapshot(fact({subjectId:'other'}),'timer.other');}});
 x.controller.refresh();x.controller.refresh();x.controller.configure(['timer.other']);
 assert.equal(x.calls.length,1);pending.resolve(snapshot());await flush();
 assert.equal(x.calls.length,2);assert.deepEqual(x.calls[1].entities,['timer.other']);
 assert.equal(x.controller.samples.has('timer.demo'),false);assert.equal(x.controller.samples.get('timer.other').timer.subjectId,'other');
});
test('unavailable bridge fails closed, but offline retains last confirmed countdown',async t=>{
 const x=setup(t);await flush();x.offline();await x.advance(5000);
 assert.equal(x.controller.online,false);assert.equal(remainingAt(x.controller.samples.get('timer.demo'),6000),60);
 assert.equal(x.calls.length,1);
 x.hass.connection.connected=true;x.hass.callWS=async()=>{throw Error('missing bridge');};x.hass.connection.dispatchEvent(new Event('ready'));await flush();
 assert.equal(x.controller.samples.size,0);assert.equal(x.controller.available,false);
});
test('sound requires explicit opt-in and successful claim before play; polls cannot repeat it',async t=>{
 const x=setup(t,{timer:finished()});await flush();assert.equal(x.sound.plays.length,0);
 await x.controller.enableSound();await flush();assert.equal(x.sound.unlocks,1);
 assert.deepEqual(x.calls.find(r=>r.type.endsWith('_claim')),{type:'domosenso_frame/timer_browser_claim',version:1,subjectId:'subject',runId:'run'});
 assert.deepEqual(x.sound.plays,[30]);await x.advance(35000);assert.equal(x.controller.playing,null);assert.equal(x.sound.plays.length,1);
});
test('claim denied including duplicate receipt never plays',async t=>{
 const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?snapshot(finished()):{version:1,asOf:'2026-11-02T12:00:00Z',claimed:false,timer:finished()}});
 await flush();await x.controller.enableSound();await flush();await x.advance(10000);assert.deepEqual(x.sound.plays,[]);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
});
for(const situation of ['host','hidden','disconnect','mapping'])test(`${situation} while claim pending prevents playback`,async t=>{
 const pending=defer();const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?snapshot(finished()):pending.promise});
 await flush();await x.controller.enableSound();await flush();assert.ok(x.calls.some(r=>r.type.endsWith('_claim')));
 if(situation==='host')x.host();if(situation==='hidden')x.hide();if(situation==='disconnect')x.offline();if(situation==='mapping')x.controller.configure([]);
 pending.resolve({version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()});await flush();assert.deepEqual(x.sound.plays,[]);
});
test('native host before connection never unlocks or claims; dismiss dispatches run-specific event',async t=>{
 const x=setup(t,{timer:finished(),host:true});await flush();await x.controller.enableSound();await flush();
 assert.equal(x.sound.unlocks,0);assert.equal(x.calls.some(r=>r.type.endsWith('_claim')),false);
 let detail;x.win.addEventListener('domosenso-frame-timer-dismiss',e=>{detail=e.detail;});
 x.win.CustomEvent=class extends Event{constructor(type,{detail}){super(type);this.detail=detail;}};
 x.controller.dismiss('subject','run');assert.deepEqual(detail,{subjectId:'subject',runId:'run'});
 assert.equal(x.calls.some(r=>r.type.endsWith('_acknowledge')),false);
});
test('old-run dismissal acknowledges only old run and never cancels the replacement',async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();
 x.controller.dismiss('subject','run');x.setTimer(fact({runId:'new-run',stateRevision:'new-rev'}));await flush();x.controller.refresh();await flush();
 const ack=x.calls.find(r=>r.type.endsWith('_acknowledge'));
 assert.deepEqual(ack,{type:'domosenso_frame/timer_browser_acknowledge',version:1,subjectId:'subject',runId:'run'});
 assert.equal(x.controller.samples.get('timer.demo').timer.runId,'new-run');assert.equal(x.controller.playing,null);
 assert.ok(x.calls.every(r=>/^domosenso_frame\/timer_browser_(snapshot|claim|acknowledge)$/.test(r.type)));
});
for(const change of ['acknowledged','removed','native target','replacement'])test(`poll stops sound on ${change}`,async t=>{
 let reply=snapshot(finished());const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?reply:{version:1,asOf:reply.asOf,claimed:true,timer:finished()}});
 await flush();await x.controller.enableSound();await flush();assert.ok(x.controller.playing);
 if(change==='removed')reply={...reply,timers:[]};else reply=snapshot(finished(change==='acknowledged'?{acknowledged:true}:change==='native target'?{alarmDeviceId:'native'}:{state:'active',runId:'new'}));
 await x.advance(5000);assert.equal(x.controller.playing,null);
});
test('foreground loss stops output; detach clears timers, connection listeners and sound context',async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();x.hide();assert.equal(x.controller.playing,null);
 x.controller.disconnect();assert.equal(x.jobs.size,0);assert.equal(x.sound.closes,1);
 const count=x.calls.length;x.hass.connection.dispatchEvent(new Event('ready'));await x.advance(10000);assert.equal(x.calls.length,count);
});
for(const patch of [{deadline:'2026-11-02T11:58:00Z'},{outcome:'unknown'},{outcome:'cancelled'},{alarmDeviceId:'native'},{acknowledged:true}])test(`ineligible completion stays silent: ${JSON.stringify(patch)}`,async t=>{
 const x=setup(t,{timer:finished(patch)});await flush();await x.controller.enableSound();await flush();assert.deepEqual(x.sound.plays,[]);assert.equal(x.calls.some(r=>r.type.endsWith('_claim')),false);
});
test('inferred recent completion may sound; server receipt deduplicates separate browser instances',async t=>{
 let claimed=false;
 const handler=r=>{const timer=finished({outcome:'inferred_completed'});if(r.type.endsWith('_snapshot'))return snapshot(timer);const won=!claimed;claimed=true;return {version:1,asOf:'2026-11-02T12:00:00Z',claimed:won,timer};};
 const a=setup(t,{handler}),b=setup(t,{handler});await flush();await Promise.all([a.controller.enableSound(),b.controller.enableSound()]);await flush();
 assert.equal(a.sound.plays.length+b.sound.plays.length,1);
});

test('core replacement during pending claim invalidates that result and refreshes without overlap',async t=>{
 const pending=defer();let response=snapshot(finished());
 const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?response:pending.promise});await flush();await x.controller.enableSound();await flush();
 response=snapshot(fact({runId:'new-run',stateRevision:'new-rev'}));x.hass.states['timer.demo']={state:'active',last_changed:'new'};x.controller.updateHass(x.hass);
 const before=x.calls.length;await x.advance(5000);assert.equal(x.calls.length,before);
 pending.resolve({version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()});await flush();
 assert.deepEqual(x.sound.plays,[]);assert.equal(x.controller.samples.get('timer.demo').timer.runId,'new-run');
});
test('reconnect ignores old snapshot and waits for fresh confirmation before claim',async t=>{
 const pending=defer();let first=true;
 const x=setup(t,{handler:()=>{if(first){first=false;return pending.promise;}return snapshot(fact({runId:'new-run'}));}});
 x.offline();x.hass.connection.connected=true;x.hass.connection.dispatchEvent(new Event('ready'));assert.equal(x.calls.length,1);
 pending.resolve(snapshot(finished()));await flush();assert.equal(x.calls.length,2);
 assert.equal(x.controller.samples.get('timer.demo').timer.runId,'new-run');assert.deepEqual(x.sound.plays,[]);
});
test('duplicate entity mapping is rejected and all selected timers share one bounded request',async t=>{
 const x=setup(t);await flush();assert.throws(()=>x.controller.configure(['timer.demo','timer.demo']));
 assert.throws(()=>x.controller.configure(Array.from({length:17},(_,i)=>'timer.demo_'+i)));
 x.controller.configure(['timer.demo','timer.second']);await flush();assert.deepEqual(x.calls.at(-1).entities,['timer.demo','timer.second']);
});
test('late snapshot after detach cannot recreate samples or audio',async t=>{
 const pending=defer();const x=setup(t,{handler:()=>pending.promise});x.controller.disconnect();pending.resolve(snapshot(finished()));await flush();
 assert.equal(x.controller.samples.size,0);assert.equal(x.jobs.size,0);assert.deepEqual(x.sound.plays,[]);
});
test('claim rejected or returning a different run fails closed',async t=>{
 for(const result of [Error('permission revoked'),{version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished({runId:'new-run'})}]){
   const x=setup(t,{handler:r=>{if(r.type.endsWith('_snapshot'))return snapshot(finished());if(result instanceof Error)throw result;return result;}});
   await flush();await x.controller.enableSound();await flush();assert.deepEqual(x.sound.plays,[]);
 }
});
test('snapshot permission failure stops an existing tone and removes authorized data',async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();assert.ok(x.controller.playing);
 x.hass.callWS=async()=>{throw Error('permission revoked');};await x.advance(5000);
 assert.equal(x.controller.playing,null);assert.equal(x.controller.samples.size,0);assert.equal(x.controller.available,false);
});
test('hidden page cannot unlock or claim until visible and explicitly enabled',async t=>{
 const x=setup(t,{timer:finished()});await flush();x.hide();await x.controller.enableSound();await flush();
 assert.equal(x.sound.unlocks,0);assert.deepEqual(x.sound.plays,[]);
 x.doc.visibilityState='visible';x.doc.dispatchEvent(new Event('visibilitychange'));await flush();assert.deepEqual(x.sound.plays,[]);
 await x.controller.enableSound();await flush();assert.equal(x.sound.plays.length,1);
});
test('unrelated HA state updates do not cause snapshots or interrupt a tone',async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();const requests=x.calls.length;
 x.hass.states['light.demo']={state:'on'};x.controller.updateHass(x.hass);await flush();assert.equal(x.calls.length,requests);assert.ok(x.controller.playing);
});

test('UTC ISO snapshots accept explicit +00:00 offsets as well as Z',async t=>{
 const timer=finished({deadline:'2026-11-02T11:59:55+00:00'});
 const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?{...snapshot(timer),asOf:'2026-11-02T12:00:00+00:00'}:{version:1,asOf:'2026-11-02T12:00:00+00:00',claimed:true,timer}});
 await flush();assert.equal(x.controller.available,true);await x.controller.enableSound();await flush();assert.equal(x.sound.plays.length,1);
});

test('a queued old-run acknowledgement survives a core replacement while a snapshot is pending',async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();
 const pending=defer();let next=true;
 x.hass.callWS=async r=>{x.calls.push(r);if(r.type.endsWith('_snapshot') && next){next=false;return pending.promise;}
   return r.type.endsWith('_snapshot')?snapshot(fact({runId:'new-run'})):{version:1,asOf:'2026-11-02T12:00:00Z',timer:fact({runId:'new-run'})};};
 x.controller.refresh();x.controller.dismiss('subject','run');
 x.hass.states['timer.demo']={state:'active',last_changed:'replacement'};x.controller.updateHass(x.hass);
 pending.resolve(snapshot(finished()));await flush();
 assert.deepEqual(x.calls.find(r=>r.type.endsWith('_acknowledge')),{type:'domosenso_frame/timer_browser_acknowledge',version:1,subjectId:'subject',runId:'run'});
 assert.equal(x.controller.samples.get('timer.demo').timer.runId,'new-run');assert.equal(x.controller.playing,null);
});

test('claim result rechecks the live connection flag even before its disconnect event arrives',async t=>{
 const pending=defer();const x=setup(t,{handler:r=>r.type.endsWith('_snapshot')?snapshot(finished()):pending.promise});
 await flush();await x.controller.enableSound();await flush();x.hass.connection.connected=false;
 pending.resolve({version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()});await flush();
 assert.deepEqual(x.sound.plays,[]);
});

test('active anchor preserves server subsecond precision instead of rounded seconds',async t=>{
 const reply={...snapshot(),asOf:'2026-11-02T12:00:00.900+00:00'};
 const x=setup(t,{handler:async()=>reply});await flush();await x.advance(400);
 assert.equal(remainingAt(x.controller.samples.get('timer.demo'),1400),64);
});

test('successful delayed claim survives a five-second poll and reconciles before playing once',async t=>{
 const claim=defer(),fresh=defer();let reconcile=false;
 const x=setup(t,{timer:finished(),handler:r=>r.type.endsWith('_snapshot')?(reconcile?fresh.promise:snapshot(finished())):claim.promise});
 await flush();await x.controller.enableSound();await flush();await x.advance(5000);
 reconcile=true;claim.resolve({version:1,asOf:'2026-11-02T12:00:05Z',claimed:true,timer:finished()});await flush();
 assert.deepEqual(x.sound.plays,[]);
 fresh.resolve(snapshot(finished()));await flush();
 assert.deepEqual(x.sound.plays,[30]);await x.advance(35000);
 assert.deepEqual(x.sound.plays,[30]);assert.equal(x.controller.playing,null);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
});

for(const phase of ['playing','pending'])test(`unrelated mapped helper change preserves A while ${phase}`,async t=>{
 const claim=defer();let b=fact({subjectId:'second',runId:'second-run'});
 const reply=()=>({...snapshot(finished()),timers:[...snapshot(finished()).timers,{entity:'timer.second',label:'Second',timer:b}]});
 const x=setup(t,{timer:finished(),handler:r=>r.type.endsWith('_snapshot')?reply():claim.promise});
 x.hass.states['timer.second']={state:'active'};x.controller.configure(['timer.demo','timer.second']);await flush();
 await x.controller.enableSound();await flush();
 const result={version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()};
 if(phase==='playing'){claim.resolve(result);await flush();assert.ok(x.controller.playing);}
 await x.advance(5000);const stops=x.sound.stops;
 b={...b,state:'paused',stateRevision:'second-paused'};x.hass.states['timer.second']={state:'paused'};x.controller.updateHass(x.hass);
 if(phase==='playing'){assert.ok(x.controller.playing);assert.equal(x.sound.stops,stops);}
 else claim.resolve(result);
 await flush();assert.deepEqual(x.sound.plays,[30]);assert.ok(x.controller.playing);
 await x.advance(phase==='playing'?25000:30000);
 assert.equal(x.controller.playing,null);assert.deepEqual(x.sound.plays,[30]);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
});

for(const [change,next] of [
 ['replacement',fact({runId:'replacement'})],['cancel',finished({outcome:'cancelled'})],
 ['pause',fact({state:'paused'})],['ack',finished({acknowledged:true})],
 ['target',finished({alarmDeviceId:'native'})],
])test(`same timer ${change} during pending claim stays silent after reconciliation`,async t=>{
 const claim=defer(),fresh=defer();let response=snapshot(finished());
 const x=setup(t,{timer:finished(),handler:r=>r.type.endsWith('_snapshot')?response:claim.promise});
 await flush();await x.controller.enableSound();await flush();
 response=fresh.promise;x.hass.states['timer.demo']={state:next.state,last_changed:change};x.controller.updateHass(x.hass);
 claim.resolve({version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()});await flush();assert.deepEqual(x.sound.plays,[]);
 fresh.resolve(snapshot(next));await flush();await x.advance(10000);
 assert.deepEqual(x.sound.plays,[]);assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
});

test('recurring polls during slow serialized snapshots and claims cannot starve sound',async t=>{
 const x=setup(t,{timer:finished()});await flush();
 let pending=null,inFlight=0,maxInFlight=0;
 x.hass.callWS=async r=>{x.calls.push(r);inFlight++;maxInFlight=Math.max(maxInFlight,inFlight);
   pending={request:r,...defer()};const reply=await pending.promise;inFlight--;return reply;};
 await x.controller.enableSound();await flush();
 for(let n=0;n<4;n++){
   const request=pending;await x.advance(6000);
   request.resolve(request.request.type.endsWith('_snapshot')?snapshot(finished()):
     {version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()});await flush();
 }
 assert.deepEqual(x.sound.plays,[30]);assert.equal(maxInFlight,1);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
 x.controller.disconnect();pending.resolve(snapshot(finished()));await flush();
});

test('core change during claim reconciliation discards the stale snapshot but retains the claim',async t=>{
 const stale=defer(),fresh=defer();let count=0;
 const x=setup(t,{timer:finished(),handler:r=>{
   if(!r.type.endsWith('_snapshot'))return {version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()};
   return ++count<=2?snapshot(finished()):count===3?stale.promise:fresh.promise;
 }});
 await flush();await x.controller.enableSound();await flush();
 x.hass.states['timer.demo']={state:'idle',last_updated:'fresh'};x.controller.updateHass(x.hass);
 stale.resolve(snapshot(finished()));await flush();assert.deepEqual(x.sound.plays,[]);
 fresh.resolve(snapshot(finished()));await flush();assert.deepEqual(x.sound.plays,[30]);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
});

for(const situation of ['host','hidden','disconnect','mapping','identity','disabled','dismiss'])test(`${situation} during successful claim reconciliation prevents playback`,async t=>{
 const fresh=defer();let count=0;
 const x=setup(t,{timer:finished(),handler:r=>{
   if(r.type.endsWith('_snapshot'))return ++count<=2?snapshot(finished()):fresh.promise;
   return {version:1,asOf:'2026-11-02T12:00:00Z',claimed:true,timer:finished()};
 }});
 await flush();await x.controller.enableSound();await flush();
 assert.equal(count,3);assert.deepEqual(x.sound.plays,[]);
 if(situation==='host')x.host();if(situation==='hidden')x.hide();if(situation==='disconnect')x.offline();
 if(situation==='mapping')x.controller.configure([]);
 if(situation==='identity')x.controller.updateHass({...x.hass,user:{id:'another-user'}});
 if(situation==='disabled')x.controller.disableSound();
 if(situation==='dismiss')x.controller.dismiss('subject','run');
 fresh.resolve(snapshot(finished()));await flush();await x.advance(5000);assert.deepEqual(x.sound.plays,[]);
 assert.equal(x.calls.filter(r=>r.type.endsWith('_claim')).length,1);
 if(situation==='dismiss')assert.equal(x.calls.filter(r=>r.type.endsWith('_acknowledge')).length,1);
});

for(const state of ['active','paused'])test(`same playing helper becoming ${state} stops immediately without restarting sound`,async t=>{
 const x=setup(t,{timer:finished()});await flush();await x.controller.enableSound();await flush();
 const pending=defer();x.hass.callWS=()=>pending.promise;
 x.hass.states['timer.demo']={state};x.controller.updateHass(x.hass);assert.equal(x.controller.playing,null);
 pending.resolve(snapshot(fact({state})));await flush();await x.advance(35000);assert.deepEqual(x.sound.plays,[30]);
});
