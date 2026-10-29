import {CatalogTabs} from '@/components/catalog-tabs';
import {ComponentBrowser} from '@/components/component-browser';
import {PageIntro} from '@/components/site';
import {catalog} from '@/lib/catalog';
import {metadata as meta} from '@/lib/seo';

export const metadata = meta('Component catalog','/components/');

export default function Page() {
  return <div className="page">
    <PageIntro label="02 / COMPONENT INDEX" title={"Find a component.\nSee what it does."}>
      <p>Versioned building blocks for Home Assistant, with requirements your agent can read and you can inspect. Each entry records what it provides and where it has been tested.</p>
    </PageIntro>
    <CatalogTabs section="components"/>
    <div className="catalog-note"><span className="mono">{catalog.length} VERSIONED ENTRIES</span><p>Installable components deliver configuration or code. Integration guides describe services you set up in Home Assistant. The current onboarding path targets Container installations.</p></div>
    <ComponentBrowser/>
  </div>;
}
