import {test} from 'node:test';
import assert from 'node:assert/strict';
import {TimerBrowserSound} from './timer-browser-sound.js';

function audioGraph(){
 const stops=[],levels=[];let starts=0,disconnects=0,closed=0;
 const oscillator={frequency:{},connect(){},start(){starts++;},stop(at){stops.push(at);},disconnect(){disconnects++;}};
 const gain={gain:{setValueAtTime:(value,at)=>levels.push([value,at])},connect(){},disconnect(){disconnects++;}};
 const context={state:'suspended',currentTime:10,destination:{},async resume(){this.state='running';},createOscillator:()=>oscillator,createGain:()=>gain,async close(){closed++;this.state='closed';}};
 return {context,stops,levels,oscillator,stats:()=>({starts,disconnects,closed})};
}
test('audio is created only on unlock; audio graph bounds even a requested long tone to 30 seconds',async()=>{
 const graph=audioGraph();let creates=0;const sound=new TimerBrowserSound(()=>{creates++;return graph.context;});
 assert.equal(sound.play(),false);assert.equal(creates,0);
 assert.equal(await sound.unlockAudioContext(),true);assert.equal(sound.play(300),true);
 assert.deepEqual(graph.stops,[40]);assert.deepEqual(graph.levels,[[0.08,10],[0,40]]);
 sound.close();assert.equal(graph.stats().closed,1);assert.ok(graph.stats().disconnects>=2);
 assert.equal(sound.play(),false);
});
test('detach during audio unlock cannot revive a closed context',async()=>{
 const graph=audioGraph();let resolve;graph.context.resume=()=>new Promise(r=>{resolve=r;});
 const sound=new TimerBrowserSound(()=>graph.context),unlock=sound.unlockAudioContext();
 sound.close();resolve();assert.equal(await unlock,false);assert.equal(sound.play(),false);
});
