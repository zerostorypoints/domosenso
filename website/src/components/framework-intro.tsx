import Link from 'next/link';
import {catalog,repository} from '@/lib/catalog';

export function FrameworkIntro() {
  return <>
    <section className="framework-intro" aria-labelledby="framework-title">
      <div className="framework-copy">
        <p className="journal-label">OPEN SOURCE / BUILT FOR AI-ASSISTED SETUP</p>
        <h1 id="framework-title">The open framework<br/>for <em>Home Assistant.</em></h1>
        <p className="framework-lead">Reusable components. An agent that knows the project. A home configuration you own.</p>
        <p>DomoSenso gives Claude Code and Codex the instructions, device requirements and tools to help configure your setup. Start from shared components and keep your home’s settings in a separate repository.</p>
        <div className="journal-actions"><Link className="journal-primary" href="/get-started/">Create your home project <span aria-hidden="true">↗</span></Link><a className="journal-link" href="#ai-workflow">See how AI helps <span aria-hidden="true">↓</span></a></div>
      </div>
      <aside className="framework-blueprint" aria-label="Framework and home project structure">
        <p className="journal-label">WHAT YOU BUILD ON</p>
        <div className="blueprint-layer"><span>01 / SHARED FRAMEWORK</span><strong>Components + contracts</strong><p>Versioned releases, device requirements and upgrade notes.</p></div>
        <div className="blueprint-layer"><span>02 / YOUR CODING AGENT</span><strong>Skills + working context</strong><p>Instructions to inspect, configure, check and prepare a deployment plan.</p></div>
        <div className="blueprint-layer blueprint-owned"><span>03 / YOUR HOME PROJECT</span><strong>Your devices. Your decisions.</strong><p>Private configuration, selected versions and your own extensions.</p></div>
        <a href={repository} className="journal-link">Explore the source <span aria-hidden="true">↗</span></a>
      </aside>
    </section>
    <div className="framework-facts"><span><b>{catalog.length}</b> versioned catalog entries</span><span>Home Assistant Container</span><span>Apache-2.0 · commercial use welcome</span></div>
    <section className="framework-workflow" id="ai-workflow" aria-labelledby="workflow-title">
      <div className="workflow-margin"><p className="journal-label">AI IN PRACTICE</p><p>You describe the setup.<br/>The agent works with the framework.</p><Link className="journal-link" href="/get-started/">Start with your agent <span aria-hidden="true">↗</span></Link></div>
      <div className="workflow-body">
        <h2 id="workflow-title">From your devices to a working plan.</h2>
        <div className="workflow-request"><span>EXAMPLE BRIEF</span><blockquote>“Help me set up Home Assistant with the devices I already have. Start with backups, then a wall tablet.”</blockquote></div>
        <ol className="workflow-sequence">
          <li><span>01</span><div><h3>Understand the home</h3><p>The agent asks about your host and goals. With the access you provide, it reads your Home Assistant devices and integrations.</p></div></li>
          <li><span>02</span><div><h3>Match the components</h3><p>It checks the catalog’s requirements, identifies missing hardware and explains what fits. You choose the scope.</p></div></li>
          <li><span>03</span><div><h3>Prepare your project</h3><p>It creates a separate home repository, starts with backup configuration, renders files and prepares a deployment plan.</p></div></li>
          <li><span>04</span><div><h3>Review, then apply</h3><p>You review the changes. Live writes need your explicit approval; configuration checks and verification support the next step.</p></div></li>
        </ol>
        <p className="workflow-caption">Illustrative workflow using the onboard-home skill. Runs in your coding agent, with your access. This website does not connect to your home.</p>
      </div>
    </section>
  </>;
}

export function OpenProject() {
  return <section className="open-project" aria-labelledby="open-project-title">
    <div className="index-heading"><div><p className="journal-label">AN OPEN FOUNDATION</p><h2 id="open-project-title">Build with it. Help it grow.</h2></div><p>For home builders, developers<br/>and professional installers.</p></div>
    <div className="project-paths">
      <article><span className="journal-label">01 / YOUR HOME</span><h3>Keep your setup yours.</h3><p>Choose components, pin their versions and keep household configuration in your own private project.</p><Link href="/get-started/" className="journal-link">Create a project ↗</Link></article>
      <article><span className="journal-label">02 / THE SHARED CODE</span><h3>Contribute what travels.</h3><p>Add device support, improve agent skills or document a test in another home. Share reusable work through pull requests.</p><Link href="/contribute/" className="journal-link">Contribution guide ↗</Link></article>
      <article><span className="journal-label">03 / PROFESSIONAL WORK</span><h3>Build services on it.</h3><p>Apache-2.0 allows commercial use. Installers can build client projects on the framework; implementation and support are separate services.</p><Link href="/professional-services/" className="journal-link">Professional services ↗</Link></article>
    </div>
    <p className="project-status">Early-stage project maintained by ZeroStoryPoints GmbH. Current field evidence comes from one personal installation; broader hardware and home coverage is work to contribute.</p>
  </section>;
}
