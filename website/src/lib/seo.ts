import type {Metadata} from 'next';
export const origin='https://domosenso.org';
export function metadata(title:string,path:string,description='Build and maintain Home Assistant setups with AI coding agents, versioned components and your own configuration.'):Metadata{return {title,description,alternates:{canonical:origin+path},openGraph:{title,description,url:origin+path,siteName:'DomoSenso Framework',type:'website',images:[{url:origin+'/social.png',width:1200,height:630}]},robots:{index:process.env.CF_PAGES_BRANCH?process.env.CF_PAGES_BRANCH==='main':true,follow:true}};}
