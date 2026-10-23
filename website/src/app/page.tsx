import Image from 'next/image';
import Link from 'next/link';
import {FrameworkIntro, OpenProject} from '@/components/framework-intro';
import {InstallationStudy} from '@/components/installation-study';
import {catalog, componentName, evidenceLabel} from '@/lib/catalog';
import {metadata as makeMetadata} from '@/lib/seo';
import './journal.css';

export const metadata = makeMetadata('The open framework for Home Assistant', '/', 'Build your Home Assistant setup with AI coding agents, reusable components and a home project you own. Explore the DomoSenso framework and contribute.');

export default function Home() {
  const ramka = catalog.find(component => component.id === 'ramka')!;
  return <div className="installation-journal">
    <FrameworkIntro/>
    <section className="journal-opening" aria-labelledby="installation-title">
      <div className="journal-title-row">
        <div><p className="journal-label">FIELD NOTES / THE FRAMEWORK IN USE</p><h2 id="installation-title">Installation <span>001</span><span className="title-period">.</span></h2></div>
        <p className="journal-deck">Inside the first installation.<br/>A concrete example of the framework’s components, running together in the maintainer’s home.</p>
      </div>
      <InstallationStudy/>
      <div className="installation-record">
        <div><span>SETTING</span><strong>Maintainer’s home</strong></div>
        <div><span>HOST</span><strong>Home Assistant Container</strong></div>
        <div><span>MATURITY</span><strong>Early stage · one home</strong></div>
        <Link href="/get-started/">Start your project <span aria-hidden="true">↗</span></Link>
      </div>
    </section>

    <section className="journal-entry" aria-labelledby="entry-title">
      <aside className="entry-margin"><span className="journal-label">ENTRY 01</span><time dateTime="2026-10-22">22 October 2026</time><span className="entry-version">ramka / 0.2.0</span><span className="margin-rule"/><p>From the release notes</p></aside>
      <div className="entry-body">
        <p className="journal-label">A CHANGE WORTH WRITING DOWN</p>
        <h2 id="entry-title">A dashboard should fit<br/>the home it lives in.</h2>
        <div className="entry-columns"><div><p className="entry-lead">Not every home has plant sensors. Not every tablet needs a photo album.</p><p>In Ramka 0.2.0, climate, air, plants and photos became optional. Leave out an input and the corresponding page is left out of the rendered dashboard and its rotation.</p><p>The shared component stays the same. Each home decides what belongs on its screen.</p><a className="journal-link" href={ramka.upgradeUrl!}>Read the actual release notes <span aria-hidden="true">↗</span></a></div>
          <figure className="detail-figure"><Image src="/journal/ramka-air.jpg" alt="A close view of Ramka’s air-quality page showing readings and trend graphs in the maintainer’s installation" width={845} height={580}/><figcaption>FIG. 02 / The air page in the first installation.<br/>A photograph, not a live reading.</figcaption></figure>
        </div>
        <details className="agent-note"><summary><span><b>IN THE WORKSHOP</b> How an agent helps with this change</span><span className="expand-sign" aria-hidden="true">+</span></summary><div className="agent-note-content"><div><span className="journal-label">EXAMPLE REQUEST</span><blockquote>“I don’t have plant sensors. Leave that page out.”</blockquote></div><ol><li><strong>Read the contract.</strong> The agent checks that <code>plants</code> is an optional input in the selected release.</li><li><strong>Prepare the configuration.</strong> It omits that input in your separate home project and renders the dashboard.</li><li><strong>Review before applying.</strong> You inspect the deployment plan and approve any change to the live installation.</li></ol><p className="agent-note-caption">Illustrative workflow · Claude Code or Codex · no connection to your home from this website</p></div></details>
      </div>
    </section>

    <section className="journal-catalog" aria-labelledby="component-index-title">
      <div className="index-heading"><div><p className="journal-label">THE REUSABLE PART</p><h2 id="component-index-title">Component index</h2></div><p>Each entry has a version, requirements<br/>and a record of what was tested.</p></div>
      <div className="journal-table" role="table" aria-label="Released component index">
        <div className="journal-table-head" role="row"><span role="columnheader">COMPONENT</span><span role="columnheader">RELEASE</span><span role="columnheader">ROLE</span><span role="columnheader">FIELD EVIDENCE</span><span aria-hidden="true"/></div>
        {catalog.map((component, index) => <Link key={component.id} href={`/components/${component.id}/`} className="journal-table-row" role="row"><span role="cell"><small>{String(index+1).padStart(2,'0')}</small><strong>{componentName(component.id)}</strong></span><span role="cell" className="release-number">{component.version}</span><span role="cell" className="index-role">{component.installationRole === 'describes' ? 'Integration guide' : 'Installable component'}</span><span role="cell" className="index-evidence">{evidenceLabel(component.testedHomes)}</span><span aria-hidden="true">↗</span></Link>)}
      </div>
      <p className="catalog-annotation"><span>NOTE</span> One installation is a starting point. Automated checks validate configuration; suitability for another home still needs to be tested.</p>
    </section>

    <OpenProject/>
    <section className="journal-next"><span className="journal-label">THE NEXT ENTRY COULD BE YOURS</span><div><h2>Start with your home.</h2><p>DomoSenso is a framework for building Home Assistant setups with coding agents and versioned components. Your home’s configuration lives in its own repository.</p><div className="journal-actions"><Link href="/get-started/" className="journal-primary">Open the getting-started guide <span aria-hidden="true">↗</span></Link><Link href="/contribute/" className="journal-link">Contribute a field note <span aria-hidden="true">↗</span></Link></div></div><aside><span className="journal-label">NEED AN INSTALLER?</span><p>Design, commissioning and maintenance through ZeroStoryPoints GmbH.</p><Link className="journal-link" href="/professional-services/">Professional services ↗</Link></aside></section>
  </div>;
}
