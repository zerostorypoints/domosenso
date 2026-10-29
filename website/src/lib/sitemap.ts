type Entry={url:string;lastModified?:string};
export type SitemapInput={
 howTos:{slug:string;status:string;updated:string}[];
 articles:{slug:string;date:string;updated?:string}[];
 devices:{id:string}[];
 catalog:{id:string}[];
 docs:{slug:string}[];
 publication?:{components:{id:string;date?:string}[]};
};
const origin='https://domosenso.org/';
export function sitemapEntries(i:SitemapInput):Entry[]{
 const at=(path:string,lastModified?:string):Entry=>lastModified?{url:origin+path,lastModified}:{url:origin+path};
 const released=new Map((i.publication?.components??[]).map(c=>[c.id,c.date]));
 return [
  ...['','get-started/','components/','devices/','docs/','contribute/','releases/','how-to/'].map(p=>at(p)),
  // Drafts stay out of the sitemap in every build, previews included.
  ...i.howTos.filter(h=>h.status==='published').map(h=>at(`how-to/${h.slug}/`,h.updated)),
  at('journal/'),
  ...i.articles.map(a=>at(`journal/${a.slug}/`,a.updated??a.date)),
  ...i.devices.map(d=>at(`devices/${d.id}/`)),
  at('professional-services/'),
  ...i.catalog.map(c=>at(`components/${c.id}/`,released.get(c.id))),
  ...i.docs.map(d=>at(`docs/${d.slug}/`)),
 ];
}
