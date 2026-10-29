// Server modules only: howtos.json holds drafts, and a client component importing it would ship
// them in the public JavaScript (e2e/drafts.spec.ts checks the build output).
import data from '../generated/howtos.json';
export type HowToBranch={situation:string;needs:string;wiring:string;supported:'yes'|'coming-soon'|'no';issue?:string;prompt?:string};
export type HowTo={slug:string;title:string;description:string;components:string[];devices:string[];status:'draft'|'published';updated:string;sources:string[];branches:HowToBranch[];body:string};
export const howTos=data as HowTo[];
export function isPreviewBuild(branch:string|undefined=process.env.CF_PAGES_BRANCH):boolean{return !!branch&&branch!=='main';}
export function visibleHowTos(all:HowTo[],preview=isPreviewBuild()):HowTo[]{return preview?all:all.filter(h=>h.status==='published');}
export function howToLinks(slugs:string[],preview=isPreviewBuild()):HowTo[]{const v=visibleHowTos(howTos,preview);return slugs.flatMap(s=>v.filter(h=>h.slug===s));}
export function howToJsonLd(h:HowTo,origin='https://domosenso.org'):object[]{
 const url=`${origin}/how-to/${h.slug}/`;
 return [
  {'@context':'https://schema.org','@type':'HowTo',name:h.title,description:h.description,dateModified:h.updated,url,
   step:h.branches.filter(b=>b.supported==='yes').map(b=>({'@type':'HowToStep',name:b.situation,text:`${b.needs} ${b.prompt??''}`.trim()}))},
  {'@context':'https://schema.org','@type':'BreadcrumbList',itemListElement:[
   {'@type':'ListItem',position:1,name:'Home',item:`${origin}/`},
   {'@type':'ListItem',position:2,name:'How-to',item:`${origin}/how-to/`},
   {'@type':'ListItem',position:3,name:h.title,item:url}]}
 ];
}
// The page opens with the body's first paragraph, the answer to the search, before the branch table.
export function splitLead(body:string):{lead:string;rest:string}{
 const text=body.trim();const end=text.search(/\n\s*\n/);
 const first=end<0?text:text.slice(0,end);
 if(/^(#|[-*+] |\d+\. |\||>|```)/.test(first))return {lead:'',rest:text};
 return {lead:first,rest:end<0?'':text.slice(end).trim()};
}
