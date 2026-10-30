import Link from 'next/link';
import Image from 'next/image';
import {notFound} from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {devices} from '@/lib/content';
import {componentName} from '@/lib/catalog';
import {HardwarePhoto} from '@/components/hardware-photo';
import {RelatedHowTos} from '@/components/howto-cards';
import {PageIntro} from '@/components/site';
import {metadata as meta} from '@/lib/seo';
type Props={params:Promise<{id:string}>};
export const dynamicParams=false;
export function generateStaticParams(){return devices.map(d=>({id:d.id}));}
export async function generateMetadata({params}:Props){const {id}=await params;const device=devices.find(d=>d.id===id);if(!device)notFound();return meta(device.title,`/devices/${id}/`,device.summary,{markdown:true});}
export default async function Page({params}:Props){
 const {id}=await params;const device=devices.find(d=>d.id===id);if(!device)notFound();
 return <div className="page"><PageIntro label="HARDWARE / SETUP GUIDE" title={device.title}><p>{device.summary}</p></PageIntro><Link className="text-link" href="/devices/">All hardware</Link><HardwarePhoto src={device.photo} detail/><div className="device-record"><strong>Documented component versions</strong><ul>{device.compatibility.map(c=><li key={c.id}><Link className="text-link" href={`/components/${c.id}/`}>{componentName(c.id)} · {c.version} ↗</Link></li>)}</ul><a className="text-link" href={device.sourceUrl}>View pinned hardware source ↗</a><p>Follow the instructions for this exact model and role. Compatibility with other models is not implied.</p></div><article className="prose device-article"><ReactMarkdown remarkPlugins={[remarkGfm]} components={{h1:({children})=><h2>{children}</h2>,table:({children})=><div className="wiring-table-scroll" tabIndex={0} role="region" aria-label="Hardware reference table"><table>{children}</table></div>,img:({src,alt})=>typeof src==='string'?<a className="diagram-link" href={src} target="_blank" rel="noreferrer" aria-label={`Open full-size diagram: ${alt??device.title}`}><Image unoptimized src={src} width={980} height={594} alt={alt??device.title}/><span>Open full-size diagram ↗</span></a>:null}}>{device.body}</ReactMarkdown></article><RelatedHowTos deviceId={id}/><Link className="text-link" href="/devices/">All hardware</Link></div>;
}
