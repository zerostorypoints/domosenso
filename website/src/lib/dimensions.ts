// SPEC-040: a device's physical dimensions, lettered as on its drawing, each with its source.
export type Dimension={key:string;label:string;value:number[];unit?:'mm'|'g';tolerance?:number;approximate?:boolean;source:'manufacturer'|'official-model'|'caliper'|'ruler'|'inference';ref?:string;checked:string;note?:string};
const sources:Record<Dimension['source'],string>={manufacturer:'Manufacturer','official-model':'Official model',caliper:'Caliper',ruler:'Ruler',inference:'Inference'};
export function dimensionValue(d:Dimension):string{
 return `${d.approximate?'≈ ':''}${d.value.join(' × ')} ${d.unit??'mm'}${d.tolerance?` ± ${d.tolerance}`:''}`;
}
export function dimensionSource(d:Dimension):string{return sources[d.source];}
export function dimensionsOf(device:{dimensions?:unknown}):Dimension[]{return (device.dimensions??[]) as Dimension[];}
const cell=(s:string)=>s.replace(/\|/g,'\\|').replace(/\n/g,' ');
export function dimensionsMarkdown(items:Dimension[],drawing:string|null):string{
 if(!items.length)return '';
 const rows=items.map(d=>`| ${d.key} | ${cell(d.label)} | ${dimensionValue(d)} | ${d.ref?`[${dimensionSource(d)}](${d.ref})`:dimensionSource(d)} | ${d.checked} | ${cell(d.note??'')} |`);
 const table=['| Key | Dimension | Value | Source | Checked | Note |','|---|---|---|---|---|---|',...rows].join('\n');
 return ['## Dimensions',drawing?`![Dimension drawing: the letters are the table's keys](${drawing})`:'',table].filter(Boolean).join('\n\n');
}
