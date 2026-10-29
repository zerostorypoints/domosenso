export const dynamic = 'force-static';
import type {MetadataRoute} from 'next';
import {catalog} from '@/lib/catalog';
import {articles,devices,howTos} from '@/lib/content';
import {visibleHowTos} from '@/lib/howto';
import {docs} from '@/lib/docs';
export default function sitemap():MetadataRoute.Sitemap{return ['','get-started/','components/','devices/','docs/','contribute/','releases/','how-to/',...visibleHowTos(howTos).map(h=>`how-to/${h.slug}/`),'journal/',...articles.map(a=>`journal/${a.slug}/`),...devices.map(d=>`devices/${d.id}/`),'professional-services/',...catalog.map(c=>`components/${c.id}/`),...docs.map(d=>`docs/${d.slug}/`)].map(path=>({url:`https://domosenso.org/${path}`}));}
