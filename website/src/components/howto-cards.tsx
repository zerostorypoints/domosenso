import Link from 'next/link';
import {componentName} from '@/lib/catalog';
import type {HowTo} from '@/lib/content';
export function HowToCard({howTo:h}:{howTo:HowTo}){
 return <Link className="howto-card" href={`/how-to/${h.slug}/`}>
  <div className="eyebrow">{h.status==='draft'&&<span>Draft</span>}{h.components.map(id=><span key={id}>{componentName(id)}</span>)}</div>
  <h2>{h.title} <span aria-hidden="true">↗</span></h2><p>{h.description}</p>
 </Link>;
}
