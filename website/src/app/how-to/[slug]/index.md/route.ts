import {notFound} from 'next/navigation';
import {howTos,visibleHowTos} from '@/lib/howto';
import {howToMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
// The page's markdown version for agents (SPEC-020); exported as out/how-to/<slug>/index.md.
export const dynamic='force-static';
export const dynamicParams=false;
export function generateStaticParams(){return visibleHowTos(howTos).map(h=>({slug:h.slug}));}
export async function GET(_:Request,{params}:{params:Promise<{slug:string}>}){const {slug}=await params;const item=visibleHowTos(howTos).find(h=>h.slug===slug);if(!item)notFound();return markdownResponse(howToMarkdown(item));}
