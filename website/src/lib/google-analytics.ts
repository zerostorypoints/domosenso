import { validMeasurementId } from './analytics-consent';

type GoogleWindow=Window&{
 dataLayer?:unknown[];
 gtag?:(...args:unknown[])=>void;
 domosensoAnalyticsId?:string;
};
function googleWindow(){return window as GoogleWindow;}
function cleanReferrer(){try{const previous=new URL(document.referrer);return previous.origin+previous.pathname;}catch{return '';}}
export function startAnalytics(id:string){
 if(!validMeasurementId(id))return;
 const target=googleWindow();
 Object.assign(window,{[`ga-disable-${id}`]:false});
 if(target.domosensoAnalyticsId===id){
  target.gtag?.('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
  return;
 }
 target.dataLayer=target.dataLayer||[];
 // Google documents IArguments entries for the gtag dataLayer queue.
 // eslint-disable-next-line prefer-rest-params
 target.gtag=function(){target.dataLayer!.push(arguments);};
 target.gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 target.gtag('consent','update',{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 target.gtag('js',new Date());
 target.gtag('config',id,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_expires:180*24*60*60,cookie_flags:'SameSite=Lax;Secure',page_location:window.location.origin+window.location.pathname,page_referrer:cleanReferrer()});
 target.domosensoAnalyticsId=id;
 const script=document.createElement('script');
 script.id='domosenso-google-analytics';script.async=true;
 script.src=`https://www.googletagmanager.com/gtag/js?id=${id}`;
 document.head.appendChild(script);
}
export function recordPageView(pathname:string){
 googleWindow().gtag?.('event','page_view',{page_location:window.location.origin+pathname,page_title:document.title,page_referrer:cleanReferrer()});
}
export function stopAnalytics(id:string){
 // Disable collection before consent changes, then remove the loaded tag on reload.
 Object.assign(window,{[`ga-disable-${id}`]:true});
 googleWindow().gtag?.('consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
 for(const cookie of document.cookie.split(';')){
  const name=cookie.split('=')[0].trim();
  if(name!=='_ga'&&!name.startsWith('_ga_'))continue;
  for(const domain of ['',window.location.hostname,`.${window.location.hostname}`])document.cookie=`${name}=; Max-Age=0; Path=/; SameSite=Lax${domain?`; Domain=${domain}`:''}`;
 }
}
