import Link from 'next/link';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {articles,assets,articleDate,categoryNames} from '@/lib/content';
import {componentName,repository} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';
import {howToLinks} from '@/lib/howto';
import {PageIntro} from '@/components/site';
type Props={params:Promise<{slug:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return articles.map(a=>({slug:a.slug}));}
export async function generateMetadata({params}:Props){const {slug}=await params;const a=articles.find(a=>a.slug===slug);if(!a)notFound();return {...meta(a.title,`/journal/${slug}/`,a.summary),alternates:{canonical:`/journal/${slug}/`,types:{'application/rss+xml':'/journal/feed.xml'}}};}
export default async function Page({params}:Props){
 const {slug}=await params;const a=articles.find(a=>a.slug===slug);if(!a)notFound();const cover='cover' in a?a.cover:undefined;const guides=howToLinks(('howto' in a?a.howto as string[]:undefined)??[]);
 return <div className="page"><PageIntro label={`JOURNAL / ${categoryNames[a.category].toUpperCase()}`} title={a.title}><p>{a.summary}</p></PageIntro><div className="article-meta"><time dateTime={a.date}>{articleDate(a.date)}</time> · {a.author}</div><div className="article-layout"><article className="prose">{cover&&<Image className="journal-cover" src={cover} width={960} height={365} alt={assets.find(x=>x.path===cover)?.alt??a.title}/>}<ReactMarkdown remarkPlugins={[remarkGfm]}>{a.body}</ReactMarkdown></article><aside className="article-sidebar"><section><h2>Components</h2>{a.components.map(id=><Link href={`/components/${id}/`} key={id}>{componentName(id)} ↗</Link>)}</section>{a.releases.length>0&&<section><h2>Referenced releases</h2>{a.releases.map(r=><div key={r.tag}><a href={`${repository}/tree/${r.commit}/components/${r.id}`}>{r.tag} ↗</a><a href={`${repository}/blob/${r.commit}/components/${r.id}/UPGRADE.md`}>Upgrade notes ↗</a></div>)}<p>These references stay fixed when the current catalog advances.</p></section>}{guides.length>0&&<section><h2>How-to</h2>{guides.map(h=><Link href={`/how-to/${h.slug}/`} key={h.slug}>{h.title} ↗</Link>)}</section>}<section><h2>Sources</h2>{a.sources.map((url,i)=><a key={url} href={url}>Repository source {i+1} ↗</a>)}</section><Link className="text-link" href="/journal/">← All journal entries</Link></aside></div></div>;
}
