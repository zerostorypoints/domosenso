/** @jest-environment jsdom */
import {startAnalytics,recordPageView,stopAnalytics} from './google-analytics';

type Queue=Array<ArrayLike<unknown>>;
const target=window as unknown as {dataLayer?:Queue;gtag?:unknown;domosensoAnalyticsId?:string};
beforeEach(()=>{
 delete target.dataLayer;delete target.gtag;delete target.domosensoAnalyticsId;
 document.head.innerHTML='';
 window.history.replaceState({},'', '/components/ramka/?email=private@example.com#message');
 Object.defineProperty(document,'referrer',{configurable:true,value:'https://example.com/source/?email=hidden@example.com#private'});
});
it('cleans page and referrer URLs for all automatic events and one explicit page view',()=>{
 startAnalytics('G-DOMOTEST01');recordPageView('/components/ramka/');startAnalytics('G-DOMOTEST01');
 const commands=target.dataLayer!.map(item=>Array.from(item));
 const config=commands.find(command=>command[0]==='config')?.[2];
 expect(config).toMatchObject({send_page_view:false,page_location:'http://localhost/components/ramka/',page_referrer:'https://example.com/source/',allow_google_signals:false,allow_ad_personalization_signals:false});
 expect(JSON.stringify(commands)).not.toMatch(/private@example|hidden@example|#message/);
 expect(document.querySelectorAll('script#domosenso-google-analytics')).toHaveLength(1);
 expect(commands.filter(command=>command[0]==='event'&&command[1]==='page_view')).toHaveLength(1);
});
it('revocation disables the property and removes analytics cookies while preserving unrelated cookies',()=>{
 document.cookie='_ga=analytics; Path=/';document.cookie='_ga_JXSL4W26ZS=session; Path=/';document.cookie='site-setting=keep; Path=/';
 startAnalytics('G-DOMOTEST01');stopAnalytics('G-DOMOTEST01');
 expect(Reflect.get(window,'ga-disable-G-DOMOTEST01')).toBe(true);
 expect(document.cookie).not.toMatch(/_ga=/);expect(document.cookie).not.toMatch(/_ga_JXSL4W26ZS=/);expect(document.cookie).toContain('site-setting=keep');
});
