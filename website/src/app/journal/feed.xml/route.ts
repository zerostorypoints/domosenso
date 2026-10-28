import {articles} from '@/lib/content';
import {journalFeed} from '@/lib/feed';
export const dynamic='force-static';
export function GET(){return new Response(journalFeed(articles),{headers:{'Content-Type':'application/rss+xml; charset=utf-8'}});}
