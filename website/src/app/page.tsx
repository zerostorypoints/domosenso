import {LatestJournal} from '@/components/journal-cards';
import Link from 'next/link';
import {FrameworkIntro, OpenProject} from '@/components/framework-intro';
import {InstallationStudy} from '@/components/installation-study';
import {catalog, componentName, evidenceLabel} from '@/lib/catalog';
import {metadata as makeMetadata} from '@/lib/seo';
import './journal.css';

export const metadata = makeMetadata('The open framework for Home Assistant', '/', 'Build your Home Assistant setup with AI coding agents, reusable components and a home project you own. Explore the DomoSenso framework and contribute.');

export default function Home() {
  return <div className="installation-journal">
    <FrameworkIntro/>
    <section className="journal-opening" aria-labelledby="installation-title">
      <div className="journal-title-row">
        <div><p className="journal-label">FIELD NOTES / THE FRAMEWORK IN USE</p><h2 id="installation-title">Installation <span>001</span><span className="title-period">.</span></h2></div>
        <p className="journal-deck">Inside the first installation.<br/>A concrete example of the framework’s components, running together in the maintainer’s home.</p>
      </div>
      <InstallationStudy/><Link className="text-link" href="/journal/installation-001/">Read the installation story →</Link>
      <div className="installation-record">
        <div><span>SETTING</span><strong>Maintainer’s home</strong></div>
        <div><span>HOST</span><strong>Home Assistant Container</strong></div>
        <div><span>MATURITY</span><strong>Early stage · one home</strong></div>
        <Link href="/get-started/">Start your project <span aria-hidden="true">↗</span></Link>
      </div>
    </section>

    <LatestJournal/>

    <section className="journal-catalog" aria-labelledby="component-index-title">
      <div className="index-heading"><div><p className="journal-label">THE REUSABLE PART</p><h2 id="component-index-title">Component index</h2></div><p>Each entry has a version, requirements<br/>and a record of what was tested.</p></div>
      <div className="journal-table" role="table" aria-label="Released component index">
        <div className="journal-table-head" role="row"><span role="columnheader">COMPONENT</span><span role="columnheader">RELEASE</span><span role="columnheader">ROLE</span><span role="columnheader">FIELD EVIDENCE</span><span aria-hidden="true"/></div>
        {catalog.map((component, index) => <Link key={component.id} href={`/components/${component.id}/`} className="journal-table-row" role="row"><span role="cell"><small>{String(index+1).padStart(2,'0')}</small><strong>{componentName(component.id)}</strong></span><span role="cell" className="release-number">{component.version}</span><span role="cell" className="index-role">{component.installationRole === 'describes' ? 'Integration guide' : 'Installable component'}</span><span role="cell" className="index-evidence">{evidenceLabel(component.testedHomes)}</span><span aria-hidden="true">↗</span></Link>)}
      </div>
      <p className="catalog-annotation"><span>NOTE</span> One installation is a starting point. Automated checks validate configuration; suitability for another home still needs to be tested.</p>
    </section>

    <p><Link className="text-link" href="/components/">Explore the visual component browser →</Link></p>
    <OpenProject/>
    <section className="journal-next"><span className="journal-label">THE NEXT ENTRY COULD BE YOURS</span><div><h2>Start with your home.</h2><p>DomoSenso is a framework for building Home Assistant setups with coding agents and versioned components. Your home’s configuration lives in its own repository.</p><div className="journal-actions"><Link href="/get-started/" className="journal-primary">Open the getting-started guide <span aria-hidden="true">↗</span></Link><Link href="/contribute/" className="journal-link">Contribute a field note <span aria-hidden="true">↗</span></Link></div></div><aside><span className="journal-label">NEED AN INSTALLER?</span><p>Design, commissioning and maintenance through ZeroStoryPoints GmbH.</p><Link className="journal-link" href="/professional-services/">Professional services ↗</Link></aside></section>
  </div>;
}
