export const dynamic = 'force-static';
import type {MetadataRoute} from 'next';
import {catalog} from '@/lib/catalog';
import {articles,devices} from '@/lib/content';
import {howTos} from '@/lib/howto';
import {docs} from '@/lib/docs';
import {sitemapEntries} from '@/lib/sitemap';
export default function sitemap():MetadataRoute.Sitemap{return sitemapEntries({howTos,articles,devices,catalog,docs});}
