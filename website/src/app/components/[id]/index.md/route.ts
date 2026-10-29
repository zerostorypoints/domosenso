import {notFound} from 'next/navigation';
import {catalog} from '@/lib/catalog';
import {componentMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
// The page's markdown version for agents (SPEC-020); exported as out/components/<id>/index.md.
export const dynamic='force-static';
export const dynamicParams=false;
export function generateStaticParams(){return catalog.map(c=>({id:c.id}));}
export async function GET(_:Request,{params}:{params:Promise<{id:string}>}){const {id}=await params;const item=catalog.find(c=>c.id===id);if(!item)notFound();return markdownResponse(componentMarkdown(item));}
