type FeedArticle={slug:string;title:string;summary:string;date:string};
const escape=(text:string)=>text.replace(/[<>&"']/g,char=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[char]!));
export function journalFeed(articles:FeedArticle[]):string{
 return '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel><title>DomoSenso Journal</title><link>https://domosenso.org/journal/</link><description>Releases, updates and installation stories.</description><language>en</language>'+articles.map(a=>`<item><title>${escape(a.title)}</title><link>https://domosenso.org/journal/${escape(a.slug)}/</link><guid>https://domosenso.org/journal/${escape(a.slug)}/</guid><description>${escape(a.summary)}</description><pubDate>${new Date(a.date+'T12:00:00Z').toUTCString()}</pubDate></item>`).join('')+'</channel></rss>\n';
}
