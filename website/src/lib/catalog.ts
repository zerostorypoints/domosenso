import data from '../generated/catalog.json';
export const catalog=data.components;
export const frameworkCommit=data.frameworkCommit;
export type Component=typeof catalog[number];
export const repository='https://github.com/zerostorypoints/domosenso';
export function evidenceLabel(homes:number|null):string{return homes===null?'Field evidence not recorded':homes===0?'Not field-tested':`Tested in ${homes} ${homes===1?'home':'homes'}`;}
export function componentName(id:string):string{return ({'ramka':'Ramka wall tablet','climate-air':'Climate & air','bermuda-presence':'Room presence','awnings':'Awnings','backup':'Backups','plants':'Plant care','lights':'Lighting','media':'Connected audio','weather':'Weather','calendar':'Calendar'} as Record<string,string>)[id]??id;}
