import {metadata} from './seo';
test('a page with a markdown version links it as rel=alternate',()=>{
 const types=metadata('T','/how-to/a/',undefined,{markdown:true}).alternates?.types as Record<string,string>;
 expect(types['text/markdown']).toBe('https://domosenso.org/how-to/a/index.md');
});
test('a page without one has no alternate types',()=>{
 expect(metadata('T','/').alternates?.types).toBeUndefined();
});
