export const ANALYTICS_CHOICE_KEY='domosenso-analytics-consent-v1';
export const ANALYTICS_CHOICE_MAX_AGE=180*24*60*60*1000;
export type AnalyticsChoice='granted'|'denied';
export function readAnalyticsChoice(raw:string|null,now=Date.now()):AnalyticsChoice|null{
 if(!raw)return null;
 try{
  const value=JSON.parse(raw);
  if(!value||!['granted','denied'].includes(value.choice)||typeof value.at!=='number'||!Number.isFinite(value.at))return null;
  const age=now-value.at;
  return age>=0&&age<=ANALYTICS_CHOICE_MAX_AGE?value.choice:null;
 }catch{return null;}
}
export function encodeAnalyticsChoice(choice:AnalyticsChoice,now=Date.now()){return JSON.stringify({choice,at:now});}
export function validMeasurementId(value:unknown):value is string{return typeof value==='string'&&/^G-[A-Z0-9]{6,20}$/.test(value);}
