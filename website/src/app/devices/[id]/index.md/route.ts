import {notFound} from 'next/navigation';
import {devices} from '@/lib/content';
import {deviceMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
// The page's markdown version for agents (SPEC-020); exported as out/devices/<id>/index.md.
export const dynamic='force-static';
export const dynamicParams=false;
export function generateStaticParams(){return devices.map(d=>({id:d.id}));}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const item=devices.find(d=>d.id===id);if(!item)notFound();return markdownResponse(deviceMarkdown(item));}
