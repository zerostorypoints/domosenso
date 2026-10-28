import Link from 'next/link';
import {catalog} from '@/lib/catalog';
import {devices} from '@/lib/content';

export function CatalogTabs({section}:{section:'components'|'hardware'}) {
  return <nav className="catalog-tabs" aria-label="Catalog sections">
    <Link href="/components/" aria-current={section==='components'?'page':undefined}>
      DomoSenso components <span>{catalog.length}</span>
    </Link>
    <Link href="/devices/" aria-current={section==='hardware'?'page':undefined}>
      Hardware <span>{devices.length}</span>
    </Link>
  </nav>;
}
