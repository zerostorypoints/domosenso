import {PageIntro} from '@/components/site';
import {JournalList} from '@/components/journal-list';
import {metadata as meta} from '@/lib/seo';
export const metadata=meta('Journal','/journal/','Releases, practical updates and installation stories from DomoSenso.');
export default function Page(){return <div className="page"><PageIntro label="NOTES FROM THE WORKSHOP" title={'Small changes.\nReal installations.'}><p>What changed, why it matters, and what we learn when components meet a home. Release notes and field stories, with sources you can inspect.</p></PageIntro><JournalList/><a className="text-link journal-feed" href="/journal/feed.xml">Subscribe with RSS ↗</a></div>;}
