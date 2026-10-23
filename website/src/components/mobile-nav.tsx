'use client';

import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {repository} from '@/lib/catalog';

export function MobileNav() {
  const pathname = usePathname();
  return <details className="mobile-nav" key={pathname}>
    <summary>Menu <span aria-hidden="true">+</span></summary>
    <nav aria-label="Mobile navigation" onClick={event => {
      if ((event.target as HTMLElement).closest('a')) {
        event.currentTarget.closest('details')?.removeAttribute('open');
      }
    }}>
      <Link href="/get-started/">Get started</Link>
      <Link href="/components/">Components</Link>
      <Link href="/docs/">Docs</Link>
      <Link href="/contribute/">Contribute</Link>
      <a href={repository}>GitHub ↗</a>
    </nav>
  </details>;
}
