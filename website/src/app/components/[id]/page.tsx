import Link from 'next/link';
import {notFound} from 'next/navigation';
import {PageIntro,Code} from '@/components/site';
import {catalog,componentName,evidenceLabel} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';

type Props = {params:Promise<{id:string}>};
export function generateStaticParams() { return catalog.map(component => ({id:component.id})); }
export const dynamicParams = false;
export async function generateMetadata({params}:Props) {
  const {id} = await params;
  const component = catalog.find(component => component.id === id);
  if (!component) notFound();
  return meta(componentName(id),`/components/${id}/`,component.summary);
}

const requirementLabels:Record<string,string> = {recommend:'Recommended',via:'Connects through',count:'Quantity',note:'Setup note',app:'App',power:'Power',protocol:'Protocol',brand:'Brand'};

export default async function Page({params}:Props) {
  const {id} = await params;
  const component = catalog.find(component => component.id === id);
  if (!component) notFound();
  const isGuide = component.installationRole === 'describes';

  return <div className="page">
    <PageIntro label={`COMPONENT INDEX / ${isGuide?'INTEGRATION GUIDE':'INSTALLABLE COMPONENT'} / v${component.version}`} title={componentName(id)}><p>{component.summary}</p></PageIntro>
    <div className="component-detail">
      <aside className="release-panel">
        <span className="pill">{isGuide?'Integration guide':'Installable component'}</span><h2>Release record</h2>
        <dl><dt>Version</dt><dd className="mono">{component.version}</dd><dt>Field use</dt><dd>{evidenceLabel(component.testedHomes)}</dd><dt>Home Assistant</dt><dd>{component.testedHa.join(', ')||'Not recorded'}</dd><dt>ESPHome</dt><dd>{component.testedEspHome.join(', ')||'Not recorded / not applicable'}</dd><dt>Cloud dependency</dt><dd>{component.localOnly?'Designed for local operation':'External services may be required'}</dd></dl>
        <a className="text-link" href={component.sourceUrl}>View release source</a>
        {component.upgradeUrl && <a className="text-link" href={component.upgradeUrl}>Release upgrade notes ↗</a>}
        <Link className="text-link" href="/docs/licensing/">License for this release ↗</Link>
        <Link className="text-link" href="/components/">← All components</Link>
      </aside>
      <div className="guide-content">
        <section><p className="eyebrow">01 / REQUIREMENTS</p><h2>What it needs</h2>
          {component.requirements.length ? <ul className="requirements">{component.requirements.map((requirement,index) => <li key={index}>
            <strong>{requirement.kind.replaceAll('-',' ')}</strong>
            <dl className="requirement-values">{Object.entries(requirement).filter(([key]) => key !== 'kind').map(([key,value]) => <div key={key}><dt>{requirementLabels[key]??key}: </dt><dd>{Array.isArray(value)?value.join(', '):String(value)}</dd></div>)}</dl>
          </li>)}</ul> : <p>No specific device requirement is declared by this component. Review the integrations and inputs below.</p>}
          <h3>Home Assistant integrations</h3>
          <ul className="integration-list">{component.integrations.map((integration,index) => <li key={index}><code>{integration.name}</code><span>{integration.source}</span>{'setup' in integration && <p>{integration.setup}</p>}</li>)}</ul>
        </section>
        <section><p className="eyebrow">02 / YOUR PROJECT</p><h2>{isGuide?'Set up the integration':'Add it to your home project'}</h2>
          {isGuide ? <p>This entry describes an upstream integration. It does not install that integration or provide managed configuration. Follow its setup requirements in Home Assistant.</p> : <>
            <Code>{`domosenso add ${id}@${component.version}\n# Fill in your home-specific inputs\ndomosenso render ${id}\ndomosenso status`}</Code>
            <p>Run these through <code>uv run --project &lt;catalog checkout&gt; domosenso</code> from your separate home folder. Adding and rendering files does not deploy them.</p>
          </>}
          <Link className="text-link" href="/get-started/">Start with the onboarding guide →</Link>
        </section>
        {component.inputs.length > 0 && <section><p className="eyebrow">03 / CONFIGURATION</p><h2>Your inputs</h2><div className="table-scroll"><table><thead><tr><th>Input</th><th>Type</th><th>Configuration</th></tr></thead><tbody>{component.inputs.map(input => <tr key={input.name}><td><code>{input.name}</code></td><td>{input.type}</td><td>{input.required?'Supply your value':'Default available'}</td></tr>)}</tbody></table></div></section>}
        <section className="note"><h2>Before a live change</h2>{component.limitations.map(limit => <p key={limit}>{limit}</p>)}<p>Configuration validation is not a guarantee of hardware compatibility. Review the component source and deployment plan; verify behavior after deployment.</p></section>
      </div>
    </div>
  </div>;
}
