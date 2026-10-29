import {llmsTxt,llmsFullTxt,linkText,type AgentIndexInput} from './llms';
import {howToMarkdown} from './markdown';
import {installCommands} from './install';
import {visibleHowTos,type HowTo} from './howto';
const h=(slug:string,title=slug.toUpperCase()):HowTo=>({slug,title,description:`About ${slug}`,components:[],devices:[],status:'published',updated:'2026-10-29',sources:[],body:'Body.',branches:[
 {situation:'s1',needs:'n',wiring:'w',supported:'yes',prompt:'p'},
 {situation:'s2',needs:'n',wiring:'w',supported:'coming-soon',issue:'https://example.org/i'},
 {situation:'s3',needs:'n',wiring:'w',supported:'no'}]});
const input=(howTos:HowTo[]):AgentIndexInput=>({howTos,components:[],devices:[],docs:[],articles:[],prerequisites:'HAOS is not covered. See [x](/docs/x/).'});

test('llms.txt lists every given how-to with its branches',()=>{
 const txt=llmsTxt(input([h('a'),h('b')]));
 expect(txt).toContain('- [A](https://domosenso.org/how-to/a/index.md): About a');
 expect(txt).toContain('- [B](https://domosenso.org/how-to/b/index.md): About b');
 expect(txt).toContain('  - s1 → yes');
 expect(txt).toContain('  - s2 → coming soon (https://example.org/i)');
 expect(txt).toContain('  - s3 → no');
});
test('llms.txt carries the limits and the install commands',()=>{
 const txt=llmsTxt(input([]));
 expect(txt).toContain('HAOS is not covered. See [x](https://domosenso.org/docs/x/).');
 expect(txt).toContain(installCommands);
 expect(txt.split('\n')[0]).toBe('# DomoSenso');
});
test('link text escapes brackets',()=>{
 expect(linkText('A [b]')).toBe('A \\[b\\]');
 expect(llmsTxt(input([h('a','A [b]')]))).toContain('[A \\[b\\]](');
});
test('llms-full.txt contains each how-to markdown in full',()=>{
 const full=llmsFullTxt(input([h('a'),h('b')]));
 expect(full).toContain(howToMarkdown(h('a')));
 expect(full).toContain(howToMarkdown(h('b')));
});
test('a description or situation with line breaks stays on one list line',()=>{
 const x={...h('a'),description:'Line one\nline two\n',branches:[{situation:'s\nmore',needs:'n',wiring:'w',supported:'no' as const}]};
 const txt=llmsTxt(input([x]));
 expect(txt).toContain('- [A](https://domosenso.org/how-to/a/index.md): Line one line two\n  - s more → no');
});
test('component lines carry their field evidence',()=>{
 // Without it an agent reading only the index would present a one-home component as broadly tested.
 const c={id:'plants',summary:'Plant care.',testedHomes:1} as unknown as AgentIndexInput['components'][number];
 expect(llmsTxt({...input([]),components:[c]})).toContain('- [Plant care](https://domosenso.org/components/plants/index.md): Plant care. (Tested in 1 home)');
});
test('a Codex user is told to start codex, not claude',()=>{
 expect(llmsTxt(input([]))).toContain('With Codex, run `codex` instead of `claude`');
});
test('a draft passed through visibleHowTos is absent',()=>{
 const txt=llmsTxt(input(visibleHowTos([h('a'),{...h('secret-draft'),status:'draft'}],false)));
 expect(txt).not.toContain('secret-draft');
});
