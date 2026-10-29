import type {HowTo} from './content';
export function isPreviewBuild(branch:string|undefined=process.env.CF_PAGES_BRANCH):boolean{return !!branch&&branch!=='main';}
export function visibleHowTos(all:HowTo[],preview=isPreviewBuild()):HowTo[]{return preview?all:all.filter(h=>h.status==='published');}
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
