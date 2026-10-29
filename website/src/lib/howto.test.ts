import {isPreviewBuild,visibleHowTos,howToJsonLd,howToLinks} from './howto';
import type {HowTo} from './content';
const base:HowTo={slug:'a',title:'A',description:'d',components:['plants'],devices:[],status:'published',updated:'2026-10-29',sources:['https://example.org'],body:'',branches:[
 {situation:'s1',needs:'n1',wiring:'w1',supported:'yes',prompt:'p1'},
 {situation:'s2',needs:'n2',wiring:'w2',supported:'coming-soon',issue:'https://example.org/i'},
 {situation:'s3',needs:'n3',wiring:'w3',supported:'yes',prompt:'p3'}]};
const draft:HowTo={...base,slug:'b',status:'draft'};
jest.mock('./content',()=>({howTos:[{slug:'draft-one',status:'draft',title:'D',description:'d',components:[],devices:[],updated:'2026-10-29',sources:[],body:'',branches:[]}]}));
test('preview build is any branch other than main',()=>{
 expect(isPreviewBuild(undefined)).toBe(false);
 expect(isPreviewBuild('main')).toBe(false);
 expect(isPreviewBuild('codex/x')).toBe(true);
});
test('drafts are visible only in previews',()=>{
 expect(visibleHowTos([base,draft],false)).toEqual([base]);
 expect(visibleHowTos([base,draft],true)).toEqual([base,draft]);
});
test('structured data has a HowTo with one step per supported branch and a breadcrumb',()=>{
 const ld=howToJsonLd(base) as Array<Record<string,unknown>&{step:{name:string;text:string}[];itemListElement:{item:string}[]}>;
 expect(ld[0]['@type']).toBe('HowTo');
 expect(ld[0].step).toHaveLength(2);
 expect(ld[0].step[0]).toMatchObject({name:'s1',text:'n1 p1'});
 expect(ld[1].itemListElement[2].item).toBe('https://domosenso.org/how-to/a/');
});
test('links drop unknown and invisible slugs',()=>{
 expect(howToLinks(['draft-one'],false)).toEqual([]);
 expect(howToLinks(['draft-one','nope'],true).map(h=>h.slug)).toEqual(['draft-one']);
});
