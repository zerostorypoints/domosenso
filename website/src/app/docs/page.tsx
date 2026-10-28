import {devices} from '@/lib/content';
import Link from 'next/link';
import {PageIntro} from '@/components/site';
import {docs} from '@/lib/docs';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Documentation','/docs/');
const descriptions:Record<string,string> = {
  'licensing':'Apache-2.0, the selected historical component releases and third-party notices.',
  'getting-started':'The full onboarding reference: host access, device discovery and your first home project.',
  'compatibility':'What the framework owns, what your home owns, and the contracts between them.',
  'upgrades':'Changes to component contracts and the steps to take when updating.',
  'contributing':'How to propose a reusable change, validate it and submit a pull request.',
  'integrate-a-device':'Bring a new device into the framework with documented requirements and checks.',
};

export default function Page() {
  return <div className="page">
    <PageIntro label="03 / THE WORKING MANUAL" title="Understand what you build."><p>The reference behind the workflow: ownership, component contracts and the steps for extending a setup. These documents come from the framework repository at the recorded revision.</p></PageIntro>
    <div className="catalog-note"><span className="mono">STARTING A NEW HOME?</span><p>Begin with the <Link className="text-link" href="/get-started/">agent-assisted setup guide ↗</Link>. Use the references below when you need the details behind a step.</p></div>
    <div className="doc-list">{docs.map((doc,index) => <Link key={doc.slug} href={`/docs/${doc.slug}/`}><span className="mono">{String(index+1).padStart(2,'0')}</span><div><h2>{doc.title}</h2><p>{descriptions[doc.slug]}</p></div><span aria-hidden="true">↗</span></Link>)}</div>
    <section className="experience-section"><p className="eyebrow">HARDWARE & SETUP</p><h2>From the component to the device.</h2><p><Link className="text-link" href="/devices/">Browse all hardware →</Link></p><div className="device-links">{devices.map(d=><Link href={`/devices/${d.id}/`} key={d.id}><h3>{d.title} ↗</h3><p>{d.summary}</p></Link>)}</div></section>
  </div>;
}
