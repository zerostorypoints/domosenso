import Link from 'next/link';
import {PageIntro} from '@/components/site';
import {repository} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Contribute','/contribute/');

export default function Page() {
  return <div className="page">
    <PageIntro label="04 / BUILD THE SHARED FOUNDATION" title="Make it work in more homes."><p>DomoSenso is open to developers, home builders and installers. Contribute a device integration, an agent skill, a clearer guide or a reproducible test from another setup.</p></PageIntro>
    <div className="project-principles">
      <div><p className="eyebrow">WHAT BELONGS HERE</p><h2>Work others can build on.</h2><p>Reusable components, device requirements and documented behavior. A contribution should work in another home without carrying over its author’s private configuration.</p></div>
      <div><p className="eyebrow">PROJECT STEWARDSHIP</p><h2>Open code. Explicit contracts.</h2><p>Maintained by ZeroStoryPoints GmbH under Apache-2.0. Components have their own versions and upgrade notes. New capabilities start with a spec; changes are reviewed through pull requests.</p></div>
    </div>
    <div className="steps">{[
      ['01','Start with evidence.','Report the component version, host and reproducible behavior. Testing a second installation helps distinguish reusable behavior from an assumption.'],
      ['02','Propose a reusable change.','Describe what another home should be able to do. For a new component or capability, discuss the contract in a spec before implementation.'],
      ['03','Share it for review.','Work from a fork, run the required checks and open a pull request with the result. Include compatibility and upgrade notes where behavior changes.'],
    ].map(([number,title,body]) => <article key={number}><span className="step-number">{number}</span><h2>{title}</h2><p>{body}</p></article>)}</div>
    <div className="note"><strong>Share the lesson, keep the household private.</strong><p>Remove access tokens, home configurations, device identifiers, network addresses, private photographs and HA snapshots from issues and pull requests. Follow the security policy for vulnerability reports.</p></div>
    <div className="actions"><Link className="button" href="/docs/contributing/">Read the contribution guide ↗</Link><a className="text-link" href={repository+'/issues'}>Browse issues ↗</a><Link className="text-link" href="/docs/integrate-a-device/">Integrate a device →</Link></div>
  </div>;
}
