export const dynamic = 'force-static';
import type {MetadataRoute} from 'next';
import {catalog} from '@/lib/catalog';
import {docs} from '@/lib/docs';
export default function sitemap():MetadataRoute.Sitemap{return ['','get-started/','components/','docs/','contribute/','releases/','professional-services/',...catalog.map(c=>`components/${c.id}/`),...docs.map(d=>`docs/${d.slug}/`)].map(path=>({url:`https://domosenso.org/${path}`}));}
