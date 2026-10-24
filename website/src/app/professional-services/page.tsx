import Link from 'next/link';
import {PageIntro} from '@/components/site';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Professional services','/professional-services/');

export default function Page() {
  return <div className="page">
    <PageIntro label="06 / PROFESSIONAL SERVICES" title={'Open foundation.\nA considered installation.'}><p>Use the framework yourself or bring in help with assessment, implementation and maintenance. DomoSenso’s commercial services are provided by ZeroStoryPoints GmbH in the Basel region.</p></PageIntro>
    <div className="project-principles">
      <div><p className="eyebrow">FOR INSTALLERS & DEVELOPERS</p><h2>A base for your own services.</h2><p>Apache-2.0 permits commercial use of the framework. Build client projects in separate repositories and contribute reusable improvements to the shared code. Each provider defines its own scope and support.</p></div>
      <div><p className="eyebrow">FOR OWNERS & OPERATORS</p><h2>A project scoped around your building.</h2><p>ZeroStoryPoints GmbH offers DomoSenso services from Biel-Benken. Homes, hospitality and businesses start with different requirements and an agreed installation scope.</p></div>
    </div>
    <div className="steps">{[
      ['01','Assess & plan','Review devices, priorities and network requirements. Define which functions are useful and what needs validation.'],
      ['02','Configure & commission','Select reusable components, adapt the project configuration and test the behavior in the installation.'],
      ['03','Document & maintain','Document controls and dependencies, review backup monitoring and agree the approach to future updates.'],
    ].map(([number,title,body]) => <article key={number}><span className="step-number">{number}</span><h2>{title}</h2><p>{body}</p></article>)}</div>
    <div className="note"><p>Hospitality and business work begins with requirements and a suitable pilot. The framework’s current field evidence is one personal installation; service descriptions are not completed-project references.</p><p>Consultations preferably in English. Equipment, electrical work and ongoing support are agreed separately.</p></div>
    <div className="actions"><a className="button" href="https://domosenso.com/en/#contact">Discuss your project</a><Link className="text-link" href="/get-started/">Build your own setup →</Link></div>
  </div>;
}
