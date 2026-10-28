import data from '../generated/content.json';
export const editorial = data.components;
export const devices = data.devices;
export const articles = data.articles;
export const assets = data.assets;
export type Editorial = typeof editorial[number];
export type Article = typeof articles[number];
export const categoryNames:Record<string,string>={releases:'Releases',updates:'Updates',installations:'Installation stories'};
export function articleDate(value:string){return new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));}
