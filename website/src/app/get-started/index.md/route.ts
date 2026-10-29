import {getStartedMarkdown} from '@/lib/markdown';
import {markdownResponse} from '@/lib/markdown-response';
export const dynamic='force-static';
export function GET(){return markdownResponse(getStartedMarkdown());}
