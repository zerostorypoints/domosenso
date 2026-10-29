import Link from 'next/link';
import {PageIntro,Code,Arrow} from '@/components/site';
import {installCommands,starterPrompt,noHomeAssistant} from '@/lib/install';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Get started','/get-started/');

export default function Page() {
  return <div className="page">
    <PageIntro label="01 / GET STARTED" title="One home. Your own project.">
      <p>Give your coding agent a framework to work with. It helps you choose components, prepare configuration and inspect a deployment plan for your Home Assistant setup.</p>
    </PageIntro>
    <div className="guide-layout">
      <aside className="guide-aside">
        <p className="eyebrow">BEFORE YOU START</p>
        <dl><dt>Installation</dt><dd>Home Assistant Container, or a Docker host to install it on</dd><dt>Host access</dt><dd>SSH, key-based, with Docker available</dd><dt>Local tools</dt><dd>Git, GitHub CLI (gh), uv, Claude Code or Codex</dd><dt>Field-tested host</dt><dd>Synology NAS with Container Manager</dd></dl>
        <p className="note">HAOS is not supported by this onboarding path. Other Docker hosts need individual validation.</p>
        <Link className="text-link" href="/docs/compatibility/">Ownership & contracts ↗</Link>
      </aside>
      <div className="guide-content">
        <section><span className="step-number">01 / PREPARE</span><h2>Open the framework with your agent.</h2>
          <p>Clone the catalog; its component tags come with it. This is the shared framework; your home project will live in a separate folder.</p>
          <Code>{installCommands}</Code>
          <p>In Claude Code, run <code>/onboard-home</code>. In Codex, start <code>codex</code> instead and ask it to use the onboard-home skill. You can begin with this prompt:</p>
          <div className="starter-prompt"><p className="eyebrow">PASTE INTO YOUR CODING AGENT</p>
            <blockquote aria-label="Starter prompt">{starterPrompt}</blockquote>
            <p>The conversation happens in your agent. There is no AI chat or connection to your installation on this website.</p>
          </div>
        </section>
        <section aria-labelledby="no-ha"><h2 id="no-ha">No Home Assistant yet?</h2>
          {noHomeAssistant.map(p=><p key={p}>{p}</p>)}
        </section>
        <section><span className="step-number">02 / DISCOVER</span><h2>Work from the devices you have.</h2>
          <p>The skill asks about your host and priorities. With the access you provide, it reads your Home Assistant devices and discovered integrations, then compares them with the catalog’s requirements.</p>
          <p>You get a proposal: components that fit, hardware that is missing and setup steps you need to complete. You choose which components belong in your project.</p>
          <div className="note"><strong>Keep credentials outside your project.</strong><p>Create your Home Assistant token yourself and store it in a file outside every repository, with restrictive file permissions. Give the agent the file path; never paste the token into a chat or issue.</p></div>
        </section>
        <section><span className="step-number">03 / CONFIGURE</span><h2>Start with a backup plan.</h2>
          <p>The agent creates a separate home repository and starts with the backup component. It helps fill in the inputs, render configuration and prepare a deployment plan. Keep your home repository private.</p>
          <Code>{'domosenso add backup@0.1.0\ndomosenso render\ndomosenso status\ndomosenso deploy production --plan'}</Code>
          <p>These commands illustrate the steps the agent takes. They are shorthand for <code>uv run --project &lt;catalog checkout&gt; domosenso …</code>, run from your home folder after initialization and input configuration.</p>
        </section>
        <section><span className="step-number">04 / REVIEW</span><h2>You decide when the plan becomes a change.</h2>
          <p>Onboarding stops at the deployment plan. Review file changes, integration requirements and the restart before authorizing any live writes. When you proceed, take a baseline snapshot and verify the result; check again after the first scheduled backup.</p>
          <p>Your configuration stays in your project. Shared components have pinned versions; your local extensions remain yours to maintain.</p>
          <Link className="button" href="/docs/getting-started/">Read the full guide <Arrow/></Link>
        </section>
      </div>
    </div>
  </div>;
}
