import {journalFeed} from './feed';
test('RSS escapes text and links to immutable article URLs',()=>{
 const feed=journalFeed([{slug:'release-one',title:'A & B <C>',summary:'A "sample"',date:'2026-10-28'}]);
 expect(feed).toContain('A &amp; B &lt;C&gt;');
 expect(feed).toContain('https://domosenso.org/journal/release-one/');
 expect(feed).not.toContain('undefined');
 expect(feed).toContain('Wed, 28 Oct 2026');
});
