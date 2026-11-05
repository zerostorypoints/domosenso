import Image from 'next/image';
import type {ComponentPropsWithoutRef} from 'react';
import type {ExtraProps} from 'react-markdown';

// Images in a guide's markdown: wiring diagrams and enclosure renders, each a link to its full size.
// A markdown title (`![alt](src "title")`) is the caption under the image.
export function MarkdownImage({src,alt,title,fallback}:{src?:unknown;alt?:string;title?:string;fallback:string}){
 if(typeof src!=='string')return null;
 const kind=src.endsWith('.svg')?'diagram':'image';const text=alt||fallback;
 return <a className="diagram-link" href={src} target="_blank" rel="noreferrer" aria-label={`Open full-size ${kind}: ${text}`}><Image unoptimized src={src} width={980} height={594} alt={text}/><span>{title?`${title} ↗`:`Open full-size ${kind} ↗`}</span></a>;
}

// A paragraph of images only is a grid: one image takes the full width, several sit side by side.
export function ImageParagraph({node,children,...rest}:ComponentPropsWithoutRef<'p'>&ExtraProps){
 const items=(node?.children??[]).filter(c=>!(c.type==='text'&&!c.value.trim()));
 const images=items.length>0&&items.every(c=>c.type==='element'&&c.tagName==='img');
 return images?<div className={items.length>1?'diagram-grid':'diagram-single'}>{children}</div>:<p {...rest}>{children}</p>;
}
