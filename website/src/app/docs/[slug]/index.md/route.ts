import {notFound} from 'next/navigation';
import {docs} from '@/lib/docs';
import {docMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
// The page's markdown version for agents (SPEC-020); exported as out/docs/<slug>/index.md.
export const dynamic='force-static';
export const dynamicParams=false;
export function generateStaticParams(){return docs.map(d=>({slug:d.slug}));}
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){const {slug}=await params;const item=docs.find(d=>d.slug===slug);if(!item)notFound();return markdownResponse(docMarkdown(item));}
