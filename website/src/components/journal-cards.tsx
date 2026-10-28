import Link from 'next/link';
import Image from 'next/image';
import {articles,assets,articleDate,categoryNames,type Article} from '@/lib/content';
import {ComponentVisual} from './component-visual';
export function JournalCard({article}:{article:Article}){
 const cover='cover' in article?article.cover:undefined;
 return <Link className="journal-card" href={`/journal/${article.slug}/`}>
  <div className="journal-card-image">{cover?<Image src={cover} alt={assets.find(a=>a.path===cover)?.alt??article.title} fill sizes="(max-width:650px) 100vw, 50vw"/>:<ComponentVisual id={article.components[0]??'ramka'}/>}</div>
  <div className="journal-card-copy"><div className="eyebrow"><span>{categoryNames[article.category]}</span><time dateTime={article.date}>{articleDate(article.date)}</time></div><h2>{article.title} <span aria-hidden="true">↗</span></h2><p>{article.summary}</p></div>
 </Link>;
}
export function RelatedJournal({componentId}:{componentId:string}){
 const related=articles.filter(a=>a.components.includes(componentId));
 if(!related.length)return null;
 return <section className="related-journal"><p className="eyebrow">FROM THE JOURNAL</p><h2>The component in context.</h2><div className="journal-grid">{related.map(a=><JournalCard key={a.slug} article={a}/>)}</div></section>;
}
export function LatestJournal(){return <section className="home-journal"><p className="eyebrow">THE JOURNAL</p><div className="home-journal-heading"><h2>What is taking shape.</h2><Link className="text-link" href="/journal/">All entries →</Link></div><div className="journal-grid">{articles.slice(0,2).map(a=><JournalCard key={a.slug} article={a}/>)}</div></section>;}
