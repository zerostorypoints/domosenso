import Link from 'next/link';
import {componentName} from '@/lib/catalog';
import {howTos,type HowTo} from '@/lib/content';
import {visibleHowTos} from '@/lib/howto';
export function HowToCard({howTo:h}:{howTo:HowTo}){
 return <Link className="howto-card" href={`/how-to/${h.slug}/`}>
  <div className="eyebrow">{h.status==='draft'&&<span>Draft</span>}{h.components.map(id=><span key={id}>{componentName(id)}</span>)}</div>
  <h2>{h.title} <span aria-hidden="true">↗</span></h2><p>{h.description}</p>
 </Link>;
}
export function RelatedHowTos({componentId,deviceId}:{componentId?:string;deviceId?:string}){
 const related=visibleHowTos(howTos).filter(h=>(componentId!==undefined&&h.components.includes(componentId))||(deviceId!==undefined&&h.devices.includes(deviceId)));
 if(!related.length)return null;
 return <section className="related-howto"><p className="eyebrow">HOW-TO GUIDES</p><h2>Put it to work.</h2><div className="journal-grid">{related.map(h=><HowToCard key={h.slug} howTo={h}/>)}</div></section>;
}
