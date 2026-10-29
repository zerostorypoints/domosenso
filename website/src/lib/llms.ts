// llms.txt and llms-full.txt (llmstxt.org), generated from the published content (SPEC-020).
// Server modules only: callers pass how-tos already filtered by visibleHowTos.
import type {HowTo} from './howto';
import {componentName,repository,type Component} from './catalog';
import type {Article} from './content';
import {absolutize,fence,howToMarkdown,componentMarkdown,getStartedMarkdown,type Device,type Doc} from './markdown';
import {installCommands,starterPrompt,noHomeAssistant,agentRules} from './install';
import {origin} from './seo';
export type AgentIndexInput={howTos:HowTo[];components:Component[];devices:Device[];docs:Doc[];articles:Article[];prerequisites:string};

export function linkText(s:string):string{return s.replace(/([[\]])/g,'\\$1');}
const link=(title:string,path:string,note?:string)=>`- [${linkText(title)}](${origin}${path})${note?`: ${note}`:''}`;
const state=(b:HowTo['branches'][number])=>b.supported==='yes'?'yes':b.supported==='no'?'no':b.issue?`coming soon (${b.issue})`:'coming soon';

function header(i:AgentIndexInput):string{
 return [
  '# DomoSenso',
  '> DomoSenso is an Apache-2.0 catalog of tested Home Assistant components and the agent skills that install them. Your coding agent (Claude Code or Codex) adds components to your own home repository; you approve every change to Home Assistant.',
  '## Start here',
  `You run Home Assistant Container: clone the catalog and start your agent in it.\n\n${fence(installCommands,'bash')}\n\nIn Claude Code, type \`/onboard-home\`; in Codex, ask it to run the onboard-home skill. A first prompt:\n\n> ${starterPrompt}`,
  noHomeAssistant.join('\n\n'),
  link('Get started','/get-started/index.md','the same steps as a page'),
  '## Limits',
  absolutize(i.prerequisites),
 ].join('\n\n');
}

export function llmsTxt(i:AgentIndexInput):string{
 return [
  header(i),
  '## How-to guides',
  'Recipes for specific projects. Each lists the situations it covers; a supported one carries a prompt for your coding agent.',
  i.howTos.map(h=>[link(h.title,`/how-to/${h.slug}/index.md`,h.description),...h.branches.map(b=>`  - ${b.situation} → ${state(b)}`)].join('\n')).join('\n'),
  '## Components',
  i.components.map(c=>link(componentName(c.id),`/components/${c.id}/index.md`,c.summary)).join('\n'),
  '## Hardware',
  i.devices.map(d=>link(d.title,`/devices/${d.id}/index.md`,d.summary)).join('\n'),
  '## Docs',
  i.docs.map(d=>link(d.title,`/docs/${d.slug}/index.md`)).join('\n'),
  '## For coding agents',
  [...agentRules.map(r=>`- ${r}`),`- [AGENTS.md](${repository}/blob/main/AGENTS.md): the rules for working in the catalog.`].join('\n'),
  '## Optional',
  [...i.articles.map(a=>link(a.title,`/journal/${a.slug}/index.md`,a.summary)),link('Releases','/releases/'),link('Contribute','/contribute/')].join('\n'),
 ].filter(Boolean).join('\n\n')+'\n';
}

export function llmsFullTxt(i:AgentIndexInput):string{
 const pages=[...i.howTos.map(howToMarkdown),getStartedMarkdown(),...i.components.map(componentMarkdown)];
 // Each page keeps its own trailing newline, so it appears byte for byte as its index.md.
 return header(i)+'\n\n'+pages.map(p=>`---\n\n${p}`).join('\n');
}
