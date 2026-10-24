import Link from 'next/link';
import {PageIntro} from '@/components/site';
import {catalog,componentName,frameworkCommit,repository} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Releases & upgrades','/releases/');

export default function Page() {
  return <div className="page">
    <PageIntro label="05 / RELEASE LEDGER" title="Know what is running."><p>Components are versioned independently. This catalog records selected release tags; your home’s lockfile records the exact commits it uses.</p></PageIntro>
    <div className="release-note"><span className="eyebrow">DOCUMENTED FRAMEWORK REVISION</span><a className="mono" href={`${repository}/tree/${frameworkCommit}`}>{frameworkCommit.slice(0,12)} ↗</a><p>Read upgrade notes before changing a component. Review the new deployment plan and verify behavior against a baseline snapshot.</p></div>
    <div className="doc-list">{catalog.map(component => <Link key={component.id} href={`/components/${component.id}/`}><span className="mono">{component.version}</span><h2>{componentName(component.id)}</h2><span aria-hidden="true">↗</span></Link>)}</div>
    <Link className="button" href="/docs/upgrades/">Read upgrade notes →</Link>
  </div>;
}
