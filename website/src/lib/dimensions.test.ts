import {dimensionValue,dimensionsMarkdown,type Dimension} from './dimensions';
const body:Dimension={key:'A',label:'Body, width × depth × height',value:[24,24,9.5],source:'manufacturer',ref:'https://example.org/p',checked:'2026-11-07',note:'Caliper: 9 | 10 mm.'};
const cap:Dimension={key:'E',label:'Button cap',value:[13],approximate:true,source:'caliper',checked:'2026-11-07'};
const pin:Dimension={key:'B',label:'Axis',value:[2.15],tolerance:0.2,source:'manufacturer',ref:'https://example.org/d',checked:'2026-11-05'};
test('values carry unit, approximation and tolerance',()=>{
 expect(dimensionValue(body)).toBe('24 × 24 × 9.5 mm');
 expect(dimensionValue(cap)).toBe('≈ 13 mm');
 expect(dimensionValue(pin)).toBe('2.15 mm ± 0.2');
 expect(dimensionValue({...cap,approximate:false,value:[7.5],unit:'g'})).toBe('7.5 g');
});
test('markdown lists the drawing and one row per key, sources linked',()=>{
 const md=dimensionsMarkdown([body,cap],'/dimensions/x.svg');
 expect(md).toContain('## Dimensions\n\n![Dimension drawing');
 expect(md).toContain('(/dimensions/x.svg)');
 expect(md).toContain('| A | Body, width × depth × height | 24 × 24 × 9.5 mm | [Manufacturer](https://example.org/p) | 2026-11-07 | Caliper: 9 \\| 10 mm. |');
 expect(md).toContain('| E | Button cap | ≈ 13 mm | Caliper | 2026-11-07 |  |');
});
test('no dimensions, no section',()=>{expect(dimensionsMarkdown([],null)).toBe('');});
