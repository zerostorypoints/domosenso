'use client';

import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {catalog} from '@/lib/catalog';

const details = [
  {
    number: '01', label: 'Wall tablet', component: 'ramka',
    title: 'A dashboard with a physical home.',
    description: 'An Android tablet runs the Home Assistant Companion app. Ramka provides its pages, controls and ambient rotation.',
    note: 'The photograph shows the maintainer’s own setup, in Polish. The component also includes English and German.',
    x: '64%', y: '47%',
  },
  {
    number: '02', label: 'Wake sensor', component: 'bermuda-presence',
    title: 'A small sensor does the waking.',
    description: 'The radar beside the tablet supplies presence and distance. Ramka uses them to wake the screen and bring up the controls.',
    note: 'This uses the component’s optional radar feature. Radar presence and Bluetooth room estimates are different signals.',
    x: '24%', y: '74%',
  },
  {
    number: '03', label: 'Audio view', component: 'media',
    title: 'What is playing, at a glance.',
    description: 'Ramka reads a Home Assistant media_player to show the current track. The media catalog entry documents the integration requirements.',
    note: 'The documented integration was tested with a Hegel H400. The speaker in this photograph is not a compatibility claim.',
    x: '49%', y: '26%',
  },
];

export function InstallationStudy() {
  const [selected, setSelected] = useState(0);
  const detail = details[selected];
  const release = catalog.find(component => component.id === detail.component)!;

  return <div className="study-grid">
    <figure className="study-figure">
      <div className="study-photograph">
        <Image src="/journal/installation-001.jpg" alt="The maintainer’s Ramka tablet on a shelf, with a small radar board beside it" width={960} height={365} priority/>
        {details.map((item, index) => <button
          type="button" key={item.number} className="photo-marker"
          style={{left:item.x, top:item.y}}
          aria-label={`${item.number} ${item.label}`}
          aria-pressed={selected === index} aria-controls="installation-detail"
          onClick={() => setSelected(index)}
        >{item.number}</button>)}
      </div>
      <figcaption><span>FIG. 01 <span className="caption-separator">/</span> A tablet, a radar, an ordinary shelf.</span><span>Maintainer’s photograph</span></figcaption>
      <div className="study-footnote"><span className="margin-mark">↳</span><p>Follow a numbered detail to the component behind it. These are photographs of one personal installation, not a customer project or a live demo.</p></div>
    </figure>
    <aside className="study-index">
      <p className="journal-label">READ THE INSTALLATION</p>
      <div className="study-selectors">
        {details.map((item, index) => <button type="button" key={item.number}
          aria-label={`Read about ${item.label.toLowerCase()}`} aria-pressed={selected === index}
          aria-controls="installation-detail" onClick={() => setSelected(index)}>
          <span>{item.number}</span><strong>{item.label}</strong><span aria-hidden="true">↗</span>
        </button>)}
      </div>
      <section id="installation-detail" role="region" aria-label="Installation detail" aria-live="polite" className="study-detail">
        <p className="journal-label">{detail.component} <span>v{release.version}</span></p>
        <h2>{detail.title}</h2>
        <p>{detail.description}</p>
        <Link className="journal-link" href={`/components/${detail.component}/`}>Open component <span aria-hidden="true">↗</span></Link>
        <details className="study-note"><summary>Field note</summary><p>{detail.note}</p></details>
      </section>
    </aside>
  </div>;
}
