import Link from 'next/link';
import {PageIntro} from '@/components/site';

export default function NotFound() {
  return <div className="page"><PageIntro label="404 / NOT FOUND" title="This page is not in the catalog."><p>Explore the component index or return to the framework homepage.</p></PageIntro><Link className="button" href="/components/">Browse components →</Link></div>;
}
