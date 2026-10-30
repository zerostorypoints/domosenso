import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// A production build (CF_PAGES_BRANCH unset or main) must not ship a draft how-to anywhere in out/:
// not as a page, a link, the sitemap, or text inside a JavaScript chunk or RSC payload.
const root=path.resolve(__dirname,'..');
function drafts(){
 return fs.readdirSync(path.join(root,'content/how-to')).filter(f=>f.endsWith('.md')).map(f=>{
  const front=fs.readFileSync(path.join(root,'content/how-to',f),'utf8').split('---')[1];
  const field=(k:string)=>(front.match(new RegExp(`^${k}: *(.+)$`,'m'))?.[1]??'').trim().replace(/^'(.*)'$/,'$1').replace(/''/g,"'");
  return {slug:field('slug'),title:field('title'),status:field('status')};
 }).filter(m=>m.status==='draft');
}
function files(dir:string):string[]{return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(dir,e.name)):[path.join(dir,e.name)]);}
test('production build output contains no draft how-to slug or title',()=>{
 const info=test.info();
 test.skip(info.project.name!=='desktop','scans files on disk once');
 test.skip(!!process.env.CF_PAGES_BRANCH&&process.env.CF_PAGES_BRANCH!=='main','preview builds render drafts');
 const list=drafts();expect(list.length).toBeGreaterThan(0);
 const hits:string[]=[];
 for(const file of files(path.join(root,'out'))){
  if(!/\.(html|txt|js|json|xml|rsc|md)$/.test(file))continue;
  const text=fs.readFileSync(file,'utf8');
  for(const d of list)for(const needle of [d.slug,d.title])if(text.includes(needle))hits.push(`${path.relative(root,file)}: ${needle}`);
 }
 expect(hits).toEqual([]);
});
