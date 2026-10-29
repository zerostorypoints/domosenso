import {notFound} from 'next/navigation';
import {articles} from '@/lib/content';
import {articleMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
// The page's markdown version for agents (SPEC-020); exported as out/journal/<slug>/index.md.
export const dynamic='force-static';
export const dynamicParams=false;
export function generateStaticParams(){return articles.map(a=>({slug:a.slug}));}
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){const {slug}=await params;const item=articles.find(a=>a.slug===slug);if(!item)notFound();return markdownResponse(articleMarkdown(item));}
