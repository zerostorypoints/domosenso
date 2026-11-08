import {MarkdownImage} from './markdown-image';
import {dimensionSource,dimensionValue,type Dimension} from '@/lib/dimensions';

// SPEC-040: the drawing and the table of a device's dimensions; nothing when the device has none.
export function DeviceDimensions({items,drawing,title}:{items:Dimension[];drawing:string|null;title:string}){
 if(!items.length)return null;
 return <section className="prose device-article device-dimensions" aria-labelledby="dimensions">
  <h2 id="dimensions">Dimensions</h2>
  {drawing&&<MarkdownImage src={drawing} alt={`Dimension drawing of the ${title}; the letters are the table's keys`} title="Open full-size drawing" fallback={title}/>}
  <div className="wiring-table-scroll" tabIndex={0} role="region" aria-label="Dimensions table"><table>
   <thead><tr><th>Key</th><th>Dimension</th><th>Value</th><th>Source</th><th>Checked</th></tr></thead>
   <tbody>{items.map(d=><tr key={d.key}>
    <td><strong>{d.key}</strong></td>
    <td>{d.label}{d.note&&<small className="dimension-note">{d.note}</small>}</td>
    <td>{dimensionValue(d)}</td>
    <td>{d.ref?<a className="text-link" href={d.ref}>{dimensionSource(d)} ↗</a>:dimensionSource(d)}</td>
    <td>{d.checked}</td>
   </tr>)}</tbody>
  </table></div>
 </section>;
}
