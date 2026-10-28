'use client';
import Link from 'next/link';
import {useEffect,useState} from 'react';
import {catalog} from '@/lib/catalog';
import {componentSearchEntries as entries} from '@/lib/catalog-search';
import {emptyFilters,readFilters,filterQuery,filterComponents,purposes,hardwareLabels,uiLabels,type Filters} from '@/lib/browser';
import {ComponentVisual} from './component-visual';
export function ComponentBrowser(){
 const [filters,setFilters]=useState<Filters>(emptyFilters);
 useEffect(()=>{const sync=()=>setFilters(readFilters(window.location.search));sync();window.addEventListener('popstate',sync);return()=>window.removeEventListener('popstate',sync);},[]);
 function change(next:Filters,replace=false){setFilters(next);window.history[replace?'replaceState':'pushState'](null,'',window.location.pathname+filterQuery(next));}
 const filtered=filterComponents(entries,filters);
 return <div className="component-browser">
  <div className="browser-toolbar"><label className="search-field">Search components<input type="search" placeholder="Try a need, a component or a device…" value={filters.q} onChange={e=>change({...filters,q:e.target.value},true)}/></label>
   {([['purpose','Purpose',purposes],['hardware','Hardware',hardwareLabels],['ui','Views',uiLabels]] as const).map(([key,label,values])=><label key={key}>{label}<select value={filters[key]} onChange={e=>change({...filters,[key]:e.target.value})}><option value="">All {label.toLowerCase()}</option>{Object.entries(values).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select></label>)}
  </div>
  <div className="browser-results"><span aria-live="polite">{filtered.length} {filtered.length===1?'component':'components'}</span><button type="button" onClick={()=>change(emptyFilters)}>Clear filters <span aria-hidden="true">↺</span></button></div>
  <div className="visual-catalog">{filtered.map((c,i)=><Link key={c.id} href={`/components/${c.id}/`} className="browser-card"><ComponentVisual id={c.id}/><div className="browser-card-copy"><div className="card-number"><span>{String(i+1).padStart(2,'0')} / {purposes[c.categories[0]]}</span><span>v{c.version}</span></div><h2>{c.name} <span aria-hidden="true">↗</span></h2><p>{c.outcome}</p><div className="card-facts"><span>{hardwareLabels[c.hardware]}</span><span>{uiLabels[c.ui]}</span></div><small>{catalog.find(item=>item.id===c.id)?.installationRole==='describes'?'Integration guide':'Installable component'}</small></div></Link>)}</div>
  {!filtered.length&&<div className="empty-state"><h2>No components match these filters.</h2><p>Try another need or clear the filters to explore the full catalog.</p></div>}
 </div>;
}
