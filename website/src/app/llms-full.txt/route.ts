import {llmsFullTxt} from '@/lib/llms';
import {howTos,visibleHowTos} from '@/lib/howto';
import {catalog} from '@/lib/catalog';
import {devices,articles} from '@/lib/content';
import {docs} from '@/lib/docs';
import agent from '@/generated/agent.json';
export const dynamic='force-static';
export function GET(){return new Response(llmsFullTxt({howTos:visibleHowTos(howTos),components:catalog,devices,docs,articles,prerequisites:agent.prerequisites}),{headers:{'Content-Type':'text/plain; charset=utf-8'}});}
