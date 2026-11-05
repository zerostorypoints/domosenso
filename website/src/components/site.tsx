import Link from 'next/link';
import Image from 'next/image';
import {componentName,evidenceLabel,type Component,repository} from '@/lib/catalog';
import {MobileNav} from './mobile-nav';
import {RedditLink} from './reddit-link';
import {validMeasurementId} from '@/lib/analytics-consent';

export function Arrow() { return <span aria-hidden="true">↗</span>; }

export function Brand() {
  return <span className="brand"><Image src="/brand/logo-compact-color.svg" width={400} height={56} alt="DomoSenso.org" className="brand-logo" unoptimized /></span>;
}

export function Header() {
  return <>
    <header className="header">
      <Link href="/" aria-label="DomoSenso framework home"><Brand/></Link>
      <nav className="desktop-nav" aria-label="Main navigation">
        <Link href="/get-started/">Get started</Link><Link href="/components/">Components</Link>
        <Link href="/docs/">Docs</Link><Link href="/how-to/">How-to</Link><Link href="/journal/">Journal</Link>
        <a href={repository}>GitHub <Arrow/></a>
        <RedditLink/>
      </nav>
      <MobileNav/>
    </header>
    <div className="edition"><div className="edition-inner">
      <span><i aria-hidden="true"/> OPEN HOME AUTOMATION</span>
      <span>COMPONENTS · AGENT SKILLS · YOUR OWN PROJECT</span>
      <a href={repository+'/blob/main/LICENSE'}>APACHE-2.0 ↗</a>
    </div></div>
  </>;
}

export function Footer() {
  return <footer className="footer">
    <div><Link href="/" aria-label="DomoSenso framework home"><Brand/></Link>
      <p>An open framework for Home Assistant.<br/>Build a home. Contribute to the shared foundation.</p>
      <p>Questions about integrations or components? Get in touch, discuss ideas and share your experience on our subreddit.</p>
      <RedditLink label="Contact & discussion · r/domosenso"/>
    </div>
    <nav aria-label="Footer">
      <Link href="/contribute/">Contribute</Link><Link href="/how-to/">How-to</Link><Link href="/journal/">Journal</Link><Link href="/releases/">Releases & upgrades</Link>
      <Link href="/professional-services/">Professional services</Link>
      <a href={repository+'/blob/main/SECURITY.md'}>Security</a>
      <Link href="/docs/licensing/">Apache-2.0 license</Link>
      {validMeasurementId(process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID)&&<button type="button" className="analytics-settings" data-analytics-settings>Analytics settings</button>}
    </nav>
    <div className="footer-bottom"><span>Maintained by <a href="https://zerostorypoints.com/">ZeroStoryPoints GmbH</a> · © 2026</span><span>Built for Home Assistant. Independently developed.</span></div>
  </footer>;
}

export function PageIntro({label,title,children}:{label:string;title:string;children:React.ReactNode}) {
  return <section className="page-intro">
    <Link className="back" href="/">← DOMOSENSO / FRAMEWORK</Link>
    <p className="eyebrow">{label}</p><h1>{title}</h1><div className="lede">{children}</div>
  </section>;
}

export function ComponentCard({component:c}:{component:Component}) {
  return <Link className="component-card" href={`/components/${c.id}/`}>
    <span className="mono">{c.version}</span><h2>{componentName(c.id)}</h2><p>{c.summary}</p>
    <span className="component-meta"><span>{c.installationRole==='describes'?'Integration guide':'Installable component'}</span><span>{evidenceLabel(c.testedHomes)}</span></span>
    <span className="row-arrow" aria-hidden="true">↗</span>
  </Link>;
}

export function Code({children}:{children:string}) {
  return <pre className="code"><code>{children}</code></pre>;
}
