import {sitemapEntries} from './sitemap';
const howTo=(slug:string,status:'draft'|'published')=>({slug,status,updated:'2026-10-29'});
const input=(over:object={})=>({
 howTos:[howTo('pub','published'),howTo('dra','draft')],
 articles:[{slug:'a1',date:'2026-10-01'},{slug:'a2',date:'2026-10-02',updated:'2026-10-05'}],
 devices:[{id:'d1'}],catalog:[{id:'c1'}],docs:[{slug:'s1'}],publication:{components:[{id:'c1'}]},...over});
const find=(e:{url:string;lastModified?:string}[],p:string)=>e.find(x=>x.url===`https://domosenso.org/${p}`);
test('published how-to carries its updated date',()=>{
 expect(find(sitemapEntries(input()),'how-to/pub/')).toEqual({url:'https://domosenso.org/how-to/pub/',lastModified:'2026-10-29'});
});
test('drafts never appear, even in a preview build',()=>{
 const old=process.env.CF_PAGES_BRANCH;process.env.CF_PAGES_BRANCH='codex/x';
 try{expect(find(sitemapEntries(input()),'how-to/dra/')).toBeUndefined();}finally{if(old===undefined)delete process.env.CF_PAGES_BRANCH;else process.env.CF_PAGES_BRANCH=old;}
});
test('journal uses updated when set, else date',()=>{
 const e=sitemapEntries(input());
 expect(find(e,'journal/a1/')?.lastModified).toBe('2026-10-01');
 expect(find(e,'journal/a2/')?.lastModified).toBe('2026-10-05');
});
test('components have no date unless publication gives one',()=>{
 const e=sitemapEntries(input({publication:{components:[{id:'c1',date:'2026-09-01'}]}}));
 expect(find(e,'components/c1/')?.lastModified).toBe('2026-09-01');
 expect(find(sitemapEntries(input()),'components/c1/')).toEqual({url:'https://domosenso.org/components/c1/'});
});
test('static paths unchanged and all URLs end with a slash',()=>{
 const e=sitemapEntries(input());
 for(const p of ['','get-started/','components/','devices/','docs/','contribute/','releases/','how-to/','journal/','professional-services/','devices/d1/','docs/s1/'])expect(find(e,p)).toBeDefined();
 for(const x of e){expect(x.url.startsWith('https://domosenso.org/')).toBe(true);expect(x.url.endsWith('/')).toBe(true);}
});
