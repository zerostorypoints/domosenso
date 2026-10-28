import Image from 'next/image';
import Link from 'next/link';
import {editorial,devices,assets} from '@/lib/content';
import {componentName,repository} from '@/lib/catalog';
import {hardwareLabels,uiLabels} from '@/lib/browser';
import {ComponentDemo} from './component-demo';
export function ComponentExperience({id}:{id:string}){
 const entry=editorial.find(c=>c.id===id)!;
 return <>
  <div className="component-summary"><p>{entry.outcome}</p><div><span>{hardwareLabels[entry.hardware]}</span><span>{uiLabels[entry.ui]}</span></div></div>
  <nav className="component-anchors" aria-label="On this component page"><a href="#example">Try it</a><a href="#views">Views</a><a href="#hardware">Hardware</a><a href="#setup">Set it up</a><a href="#release">Release details</a></nav>
  <div id="example"><ComponentDemo key={id} id={id}/></div>
  <section id="views" className="experience-section"><div className="section-intro"><p className="eyebrow">WHAT YOU WILL SEE</p><h2>Views, with their conditions.</h2><p>{entry.ui==='none'?'No bundled view. Use the exposed entities in your own Home Assistant dashboard.':entry.ui==='consumer'?'This component supplies data or controls. The views below are rendered by another component when configured.':'Included dashboard pages or cards, with the conditions that make them appear.'}</p></div>
   <div className="view-gallery">{entry.views.map(view=><article className="view-card" key={view.id}><a href={view.preview} target="_blank" rel="noreferrer" aria-label={`Enlarge ${view.title} illustration`}><Image unoptimized src={view.preview} alt={assets.find(a=>a.path===view.preview)?.alt??view.title} width={640} height={288}/></a><div><span className={`view-status ${view.availability}`}>{({default:'Default',conditional:'When configured','opt-in':'Optional card'})[view.availability]}</span><h3>{view.title}</h3><p>{view.condition}</p><p className="view-owner">Displayed by <Link href={`/components/${view.owner}/`}>{componentName(view.owner)}</Link></p><details><summary>Layout and source</summary><p>{view.layout}</p><p>Illustrative preview; fictional data, not a dashboard screenshot.</p><a className="text-link" href={`${repository}/blob/${view.sourceCommit}/${view.evidencePath}`}>View rendering source ↗</a></details></div></article>)}</div>
  </section>
  <section id="hardware" className="experience-section"><div className="section-intro"><p className="eyebrow">FROM SOFTWARE TO HARDWARE</p><h2>Give it something to connect to.</h2><p>Required and optional equipment is listed in the release details below. These guides cover the documented models and installation roles.</p></div><div className="device-links">{entry.deviceIds.map(id=>{const d=devices.find(d=>d.id===id)!;return <Link href={`/devices/${id}/`} key={id}><span className="eyebrow">DEVICE GUIDE</span><h3>{d.title} ↗</h3><p>{d.summary}</p></Link>;})}</div>{!entry.deviceIds.length&&<p>No dedicated device is required. Review software services, accounts and storage requirements in the release details.</p>}</section>
  <section id="setup" className="experience-section"><p className="eyebrow">FROM PARTS TO A WORKING COMPONENT</p><h2>Set it up, then check it.</h2><ol className="setup-steps">{entry.setup.map((step,index)=><li key={step}><span>{String(index+1).padStart(2,'0')}</span><p>{step}</p></li>)}</ol><Link className="text-link" href="/get-started/">Start with your coding agent →</Link></section>
 </>;
}
