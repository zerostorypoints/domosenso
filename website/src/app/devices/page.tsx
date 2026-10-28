import Link from 'next/link';
import {PageIntro} from '@/components/site';
import {CatalogTabs} from '@/components/catalog-tabs';
import {devices} from '@/lib/content';
import {componentName} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';

export const metadata=meta('Hardware catalog','/devices/','Explore the documented hardware behind DomoSenso components, with setup guides, wiring and component connections.');

export default function Page() {
  return <div className="page">
    <PageIntro label="02 / HARDWARE INDEX" title={'The hardware\nbehind the components.'}>
      <p>Boards, sensors, bridges and displays used by the documented components. Find the device, see where it fits, and open its setup guide.</p>
    </PageIntro>
    <CatalogTabs section="hardware"/>
    <div className="catalog-note"><span className="mono">{devices.length} DOCUMENTED DEVICES</span><p>These are the documented models and roles, not an exhaustive compatibility list. Required and optional equipment is distinguished on each component page.</p></div>
    <div className="hardware-grid">{devices.map((device,index)=><article className="hardware-card" key={device.id}>
      <div className="hardware-card-label"><span>{String(index+1).padStart(2,'0')}</span><span>{device.sourcePath.startsWith('devices/')&&device.sourcePath.endsWith('.md')?'Wiring & setup':device.sourcePath.endsWith('.md')?'Installation guide':'Setup overview'}</span></div>
      <h2>{device.title}</h2><p>{device.summary}</p>
      <div className="hardware-components"><span className="eyebrow">USED WITH</span><ul>{device.components.map(id=><li key={id}><Link href={`/components/${id}/`}>{componentName(id)}</Link></li>)}</ul></div>
      <Link className="text-link hardware-guide-link" href={`/devices/${device.id}/`}>Open device guide <span aria-hidden="true">↗</span></Link>
    </article>)}</div>
  </div>;
}
