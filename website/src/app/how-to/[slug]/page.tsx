import Link from 'next/link';
import {notFound} from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {devices,articleDate} from '@/lib/content';
import {howTos,howToJsonLd,visibleHowTos,splitLead} from '@/lib/howto';
import {componentName} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';
import {PageIntro} from '@/components/site';
type Props={params:Promise<{slug:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return visibleHowTos(howTos).map(h=>({slug:h.slug}));}
export async function generateMetadata({params}:Props){const {slug}=await params;const h=visibleHowTos(howTos).find(h=>h.slug===slug);if(!h)notFound();return meta(h.title,`/how-to/${slug}/`,h.description);}
export default async function Page({params}:Props){
 const {slug}=await params;const h=visibleHowTos(howTos).find(h=>h.slug===slug);if(!h)notFound();
 const yes=h.branches.filter(b=>b.supported==='yes'&&b.prompt);const {lead,rest}=splitLead(h.body);
 return <div className="page">
  <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(howToJsonLd(h)).replace(/</g,'\\u003c')}}/>
  <PageIntro label="HOW-TO" title={h.title}><p>{h.description}</p></PageIntro>
  {h.status==='draft'&&<p className="howto-draft" role="note">Draft — not published</p>}
  <div className="article-meta">Updated <time dateTime={h.updated}>{articleDate(h.updated)}</time></div>
  <div className="article-layout"><article className="prose">
   {lead&&<div className="howto-lead"><ReactMarkdown remarkPlugins={[remarkGfm]}>{lead}</ReactMarkdown></div>}
   <div className="wiring-table-scroll" tabIndex={0} role="region" aria-label="Situations and wiring"><table className="howto-branches"><thead><tr><th>You have</th><th>You need</th><th>Wiring</th><th>Supported</th></tr></thead><tbody>
    {h.branches.map((b,i)=><tr key={i}><td>{b.situation}</td><td>{b.needs}</td><td>{b.wiring}</td><td>{b.supported==='yes'?'Yes':b.supported==='coming-soon'?(b.issue?<a href={b.issue}>Coming soon ↗</a>:'Coming soon'):'No'}</td></tr>)}
   </tbody></table></div>
   {yes.length>0&&<section className="howto-prompt"><h2>Tell your agent</h2>{yes.map((b,i)=><div key={i}>{yes.length>1&&<p className="howto-prompt-for">{b.situation}</p>}<pre className="code"><code>{b.prompt}</code></pre></div>)}</section>}
   <ReactMarkdown remarkPlugins={[remarkGfm]}>{rest}</ReactMarkdown>
  </article><aside className="article-sidebar">
   {h.components.length>0&&<section><h2>Components</h2>{h.components.map(id=><Link href={`/components/${id}/`} key={id}>{componentName(id)} ↗</Link>)}</section>}
   {h.devices.length>0&&<section><h2>Devices</h2>{h.devices.map(id=><Link href={`/devices/${id}/`} key={id}>{devices.find(d=>d.id===id)?.title??id} ↗</Link>)}</section>}
   <section><h2>Sources</h2>{h.sources.map((url,i)=><a key={url} href={url}>Source {i+1} ↗</a>)}</section>
   <Link className="text-link" href="/how-to/">← All guides</Link>
  </aside></div></div>;
}
