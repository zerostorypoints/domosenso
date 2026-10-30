import Link from 'next/link';
import {notFound} from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {docs} from '@/lib/docs';
import {metadata as meta} from '@/lib/seo';

type Props = {params:Promise<{slug:string}>};
export function generateStaticParams() { return docs.map(doc => ({slug:doc.slug})); }
export const dynamicParams = false;
export async function generateMetadata({params}:Props) {
  const {slug} = await params;
  const doc = docs.find(doc => doc.slug === slug);
  if (!doc) notFound();
  return meta(doc.title,`/docs/${slug}/`,undefined,{markdown:true});
}

export default async function Page({params}:Props) {
  const {slug} = await params;
  const doc = docs.find(doc => doc.slug === slug);
  if (!doc) notFound();
  return <div className="page docs-layout">
    <aside className="docs-nav">
      <Link className="eyebrow" href="/docs/">THE WORKING MANUAL ↗</Link>
      <nav aria-label="Documentation">{docs.map((entry,index) => <Link key={entry.slug} href={`/docs/${entry.slug}/`} aria-current={slug===entry.slug?'page':undefined}><span>{String(index+1).padStart(2,'0')}</span>{entry.title}</Link>)}</nav>
      <a className="text-link" href={doc.sourceUrl}>View document source ↗</a>
    </aside>
    <article className="prose"><ReactMarkdown remarkPlugins={[remarkGfm]}>{doc.body}</ReactMarkdown></article>
  </div>;
}
