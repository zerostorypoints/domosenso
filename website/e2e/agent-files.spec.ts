import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// The agent files (SPEC-020) are checked in a production out/: they must match what the pages publish.
const root=path.resolve(__dirname,'..');
const out=(p:string)=>path.join(root,'out',p);
const site='https://domosenso.org';
function contentPages():string[]{
 const xml=fs.readFileSync(out('sitemap.xml'),'utf8');
 return [...xml.matchAll(/<loc>https:\/\/domosenso\.org(\/(how-to|components|devices|docs|journal)\/[^/<]+\/)<\/loc>/g)].map(m=>m[1]);
}
test.beforeEach(()=>{
 test.skip(test.info().project.name!=='desktop','scans files on disk once');
 test.skip(!!process.env.CF_PAGES_BRANCH&&process.env.CF_PAGES_BRANCH!=='main','preview builds include drafts');
});
test('every content page in the sitemap has an index.md linked from llms.txt',()=>{
 const llms=fs.readFileSync(out('llms.txt'),'utf8');
 const pages=contentPages();expect(pages.length).toBeGreaterThan(20);
 const missing=pages.filter(p=>!fs.existsSync(out(p+'index.md'))||!llms.includes(`${site}${p}index.md`));
 expect(missing).toEqual([]);
});
test('every domosenso.org link in llms.txt exists in out/',()=>{
 for(const file of ['llms.txt','llms-full.txt']){
  const text=fs.readFileSync(out(file),'utf8');
  const urls=[...new Set([...text.matchAll(/https:\/\/domosenso\.org(\/[^\s)#]*)/g)].map(m=>m[1]))];
  const missing=urls.filter(u=>!fs.existsSync(out(u.endsWith('/')?u+'index.html':u)));
  expect(missing,file).toEqual([]);
 }
});
test('every content page links its markdown',()=>{
 const missing=[...contentPages(),'/get-started/'].filter(p=>{
  const html=fs.readFileSync(out(p+'index.html'),'utf8');
  return !new RegExp(`<link[^>]*rel="alternate"[^>]*type="text/markdown"[^>]*href="${site}${p}index.md"`).test(html);
 });
 expect(missing).toEqual([]);
});
test('_headers serves markdown with a canonical link',()=>{
 const headers=fs.readFileSync(path.join(root,'public/_headers'),'utf8');
 expect(headers).toMatch(/^\/\*\/index\.md\n {2}Content-Type: text\/markdown; charset=utf-8$/m);
 for(const [section,key] of [['how-to','slug'],['components','id'],['devices','id'],['docs','slug'],['journal','slug']])
  expect(headers).toContain(`/${section}/:${key}/index.md\n  Link: <${site}/${section}/:${key}/>; rel="canonical"`);
 expect(headers).toContain(`/get-started/index.md\n  Link: <${site}/get-started/>; rel="canonical"`);
});
