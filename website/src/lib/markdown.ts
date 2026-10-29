// Markdown versions of the content pages for agents (SPEC-020), built from the objects the pages render.
// Server modules only: it imports @/lib/howto.
import type {HowTo} from './howto';
import {componentName,evidenceLabel,type Component} from './catalog';
import {devices,type Article} from './content';
import {docs} from './docs';
import {installCommands,starterPrompt,noHomeAssistant} from './install';
import {origin} from './seo';
export type Device=typeof devices[number];
export type Doc=typeof docs[number];

// A fence longer than any backtick run inside, so a prompt that quotes code stays one block.
export function fence(text:string,lang=''):string{
 const longest=Math.max(0,...(text.match(/`+/g)??[]).map(r=>r.length));
 const f='`'.repeat(Math.max(3,longest+1));
 return `${f}${lang}\n${text}\n${f}`;
}
// An agent may fetch the .md alone, so site-relative links must carry the origin.
export function absolutize(md:string):string{return md.replace(/\]\(\//g,`](${origin}/`);}
export function markdownPage(path:string,title:string,sections:string[]):string{
 return `Canonical: ${origin}${path}\n\n# ${title}\n\n${sections.filter(Boolean).join('\n\n')}\n`;
}
const list=(items:string[])=>items.map(i=>`- ${i}`).join('\n');
const supported={yes:'Yes','coming-soon':'Coming soon',no:'No'} as const;

export function howToMarkdown(h:HowTo):string{
 const branches=h.branches.map(b=>[
  `### ${b.situation}`,
  list([`Needs: ${b.needs}`,`Wiring: ${b.wiring}`,`Supported: ${supported[b.supported]}`]),
  b.supported==='yes'&&b.prompt?`Prompt for your coding agent:\n\n${fence(b.prompt)}`:'',
  b.supported==='coming-soon'&&b.issue?`Issue: ${b.issue}`:'',
 ].filter(Boolean).join('\n\n'));
 return markdownPage(`/how-to/${h.slug}/`,h.title,[
  h.description,`Updated: ${h.updated}`,absolutize(h.body.trim()),
  `## Situations\n\n${branches.join('\n\n')}`,
  h.components.length?`## Components\n\n${list(h.components.map(id=>`[${componentName(id)}](${origin}/components/${id}/index.md)`))}`:'',
  h.devices.length?`## Hardware\n\n${list(h.devices.map(id=>`[${devices.find(d=>d.id===id)?.title??id}](${origin}/devices/${id}/index.md)`))}`:'',
  `## Sources\n\n${list(h.sources)}`,
 ]);
}

const values=(r:Record<string,unknown>)=>Object.entries(r).filter(([k])=>k!=='kind').map(([k,v])=>`${k}: ${Array.isArray(v)?v.join(', '):String(v)}`).join('; ');
export function componentMarkdown(c:Component):string{
 // host.installs is left out: it lists haos, which onboarding does not cover (SPEC-020).
 return markdownPage(`/components/${c.id}/`,componentName(c.id),[
  c.summary,
  list([`Version: ${c.version}`,`Field use: ${evidenceLabel(c.testedHomes)}`,`Home Assistant: ${c.testedHa.join(', ')||'Not recorded'}`,
   `ESPHome: ${c.testedEspHome.join(', ')||'Not recorded'}`,`Role: ${c.installationRole==='describes'?'describes an integration; installs nothing':'installs configuration into your home project'}`]),
  `## Requirements\n\n${c.requirements.length?list(c.requirements.map(r=>`${r.kind}: ${values(r)}`)):'No specific device requirement is declared.'}`,
  c.optionalRequirements.length?`## Optional equipment\n\n${list(c.optionalRequirements.map(r=>`${r.kind}: ${values(r)}`))}`:'',
  `## Integrations\n\n${list(c.integrations.map(i=>`${i.name} (${i.source})${'setup' in i&&i.setup?`: ${i.setup}`:''}`))}`,
  c.inputs.length?`## Inputs\n\n${list(c.inputs.map(i=>`${i.name} (${i.type})${i.required?', required':''}`))}`:'',
  `## Limitations\n\n${list(c.limitations)}`,
  [`Source: ${c.sourceUrl}`,c.upgradeUrl?`Upgrade notes: ${c.upgradeUrl}`:''].filter(Boolean).join('\n'),
 ]);
}
export function deviceMarkdown(d:Device):string{
 // The body opens with its own H1; the page title already carries it.
 return markdownPage(`/devices/${d.id}/`,d.title,[d.summary,absolutize(d.body.replace(/^# .*\n+/,'').trim()),`Source: ${d.sourceUrl}`]);
}
export function docMarkdown(d:Doc):string{
 return markdownPage(`/docs/${d.slug}/`,d.title,[absolutize(d.body.replace(/^# .*\n+/,'').trim()),`Source: ${d.sourceUrl}`]);
}
export function articleMarkdown(a:Article):string{
 return markdownPage(`/journal/${a.slug}/`,a.title,[a.summary,`${a.date} · ${a.author}`,absolutize(a.body.trim()),a.sources.length?`## Sources\n\n${list(a.sources)}`:'']);
}
export function getStartedMarkdown():string{
 return markdownPage('/get-started/','Get started',[
  'Give your coding agent a framework to work with. It helps you choose components, prepare configuration and inspect a deployment plan for your Home Assistant setup.',
  '## Before you start\n\n'+list(['Installation: Home Assistant Container, or a Docker host to install it on','Host access: SSH, key-based, with Docker available','Local tools: Git, GitHub CLI (gh), uv, Claude Code or Codex','Field-tested host: Synology NAS with Container Manager']),
  `## Open the framework with your agent\n\n${fence(installCommands,'bash')}\n\nIn Claude Code, run \`/onboard-home\`. In Codex, start \`codex\` instead and ask it to use the onboard-home skill. You can begin with this prompt:\n\n> ${starterPrompt}`,
  `## No Home Assistant yet?\n\n${noHomeAssistant.join('\n\n')}`,
  `Full guide: ${origin}/docs/getting-started/index.md`,
 ]);
}
