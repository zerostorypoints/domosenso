import {howToMarkdown,componentMarkdown,getStartedMarkdown,absolutize,fence} from './markdown';
import {installCommands,noHomeAssistant} from './install';
import type {HowTo} from './howto';
import type {Component} from './catalog';
const base:HowTo={slug:'a',title:'A',description:'d',components:['plants'],devices:[],status:'published',updated:'2026-10-29',sources:['https://example.org/s'],body:'Lead.',branches:[
 {situation:'s1',needs:'n1',wiring:'w1',supported:'yes',prompt:'p1'},
 {situation:'s2',needs:'n2',wiring:'w2',supported:'coming-soon',issue:'https://example.org/i'},
 {situation:'s3',needs:'n3',wiring:'w3',supported:'no'}]};
const component=(testedHomes:number|null):Component=>({id:'plants',version:'0.1.0',sourceTag:'plants/0.1.0',sourceCommit:'c',summary:'Plant care.',requirements:[],integrations:[{name:'mqtt',source:'core',setup:'a broker'}],optionalRequirements:[],installationRole:'installs',testedHa:['2026.9.2'],testedEspHome:[],testedHomes,host:{installs:['container','haos'],ha_min:'2026.9'},localOnly:true,limitations:['Limited field use.'],inputs:[{name:'sensors',type:'list',required:true}],sourceUrl:'https://example.org/src',upgradeUrl:null} as unknown as Component);

test('how-to markdown carries every branch with its support state',()=>{
 const md=howToMarkdown(base);
 expect(md).toContain('```\np1\n```');
 expect(md).toContain('Issue: https://example.org/i');
 expect(md).toContain('Supported: No');
});
test('coming-soon without issue reads Coming soon',()=>{
 const md=howToMarkdown({...base,branches:[{situation:'s',needs:'n',wiring:'w',supported:'coming-soon'}]});
 expect(md).toContain('Supported: Coming soon');
 expect(md).not.toContain('undefined');
});
test('a prompt with backticks gets a longer fence',()=>{
 const md=howToMarkdown({...base,branches:[{situation:'s',needs:'n',wiring:'w',supported:'yes',prompt:'run ```x```'}]});
 expect(md).toContain('````\nrun ```x```\n````');
 expect(fence('plain')).toBe('```\nplain\n```');
});
test('root-relative links become absolute',()=>{
 expect(absolutize('![w](/wiring/a.svg) [d](/docs/x/) [e](https://example.org/)')).toBe('![w](https://domosenso.org/wiring/a.svg) [d](https://domosenso.org/docs/x/) [e](https://example.org/)');
 expect(howToMarkdown({...base,body:'See [x](/devices/y/).'})).toContain('(https://domosenso.org/devices/y/)');
});
test('component evidence: null and zero differ',()=>{
 expect(componentMarkdown(component(null))).toContain('Field evidence not recorded');
 expect(componentMarkdown(component(0))).toContain('Not field-tested');
 expect(componentMarkdown(component(0))).not.toMatch(/haos/i);
});
test('first line is the canonical URL',()=>{
 expect(howToMarkdown(base).split('\n')[0]).toBe('Canonical: https://domosenso.org/how-to/a/');
 expect(componentMarkdown(component(1)).split('\n')[0]).toBe('Canonical: https://domosenso.org/components/plants/');
});
test('get-started markdown has the install commands and the no-HA route',()=>{
 const md=getStartedMarkdown();
 expect(md).toContain(installCommands);
 expect(md).toContain(noHomeAssistant[1]);
});
