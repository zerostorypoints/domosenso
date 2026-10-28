export const dynamic = 'force-static';
import type {MetadataRoute} from 'next';
import {catalog} from '@/lib/catalog';
import {articles,devices} from '@/lib/content';
import {docs} from '@/lib/docs';
export default function sitemap():MetadataRoute.Sitemap{return ['','get-started/','components/','devices/','docs/','contribute/','releases/','journal/',...articles.map(a=>`journal/${a.slug}/`),...devices.map(d=>`devices/${d.id}/`),'professional-services/',...catalog.map(c=>`components/${c.id}/`),...docs.map(d=>`docs/${d.slug}/`)].map(path=>({url:`https://domosenso.org/${path}`}));}
