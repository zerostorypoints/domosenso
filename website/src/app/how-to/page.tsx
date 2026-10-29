import {PageIntro} from '@/components/site';
import {HowToCard} from '@/components/howto-cards';
import {howTos,visibleHowTos} from '@/lib/howto';
import {metadata as meta} from '@/lib/seo';
export const metadata=meta('How-to guides','/how-to/','Step-by-step guides that start from your situation and end with a working Home Assistant setup.');
export default function Page(){
 const list=visibleHowTos(howTos);
 return <div className="page"><PageIntro label="HOW-TO" title={'Start from what you have.'}><p>Each guide names your situation, what you need, how it is wired and what to tell your agent.</p></PageIntro>
  {list.length?<div className="howto-grid">{list.map(h=><HowToCard key={h.slug} howTo={h}/>)}</div>:<p className="howto-empty">The first guides are in preparation.</p>}</div>;
}
