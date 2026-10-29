'use client';
import {useState} from 'react';
import {editorial} from '@/lib/content';
import {ComponentVisual} from './component-visual';
export function ComponentDemo({id}:{id:string}){
 const [index,setIndex]=useState(0);const entry=editorial.find(c=>c.id===id)!;
 const state=entry.scenario.states[index];
 return <section className="component-demo" aria-label="Interactive example">
  <div className="demo-heading"><span className="eyebrow">TRY THE COMPONENT</span><span className="sample-label">Illustrative demo · sample data</span></div>
  <div className="demo-layout"><ComponentVisual id={id} level={state.level} index={index}/><div className="demo-explanation">
   <div aria-live="polite" aria-atomic="true"><h2 data-demo-headline>{state.headline}</h2><p>{state.detail}</p><dl className="demo-values">{state.values.map(value=><div key={value.label}><dt>{value.label}</dt><dd>{value.value}</dd></div>)}</dl></div>
   <div className="demo-options" role="group" aria-label="Example state">{entry.scenario.states.map((s,i)=><button type="button" key={s.label} aria-pressed={index===i} onClick={()=>setIndex(i)}>{s.label}</button>)}</div>
   <button className="reset-example" type="button" onClick={()=>setIndex(0)}>Reset example <span aria-hidden="true">↺</span></button>
  </div></div>
 </section>;
}
