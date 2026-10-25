'use client';

import {useEffect,useRef,useState,useSyncExternalStore} from 'react';
import {usePathname} from 'next/navigation';
import {ANALYTICS_CHOICE_KEY,encodeAnalyticsChoice,readAnalyticsChoice,validMeasurementId,type AnalyticsChoice} from '@/lib/analytics-consent';
import {startAnalytics,recordPageView,stopAnalytics} from '@/lib/google-analytics';

const changeEvent='domosenso:analytics-consent';
function subscribe(callback:()=>void){window.addEventListener('storage',callback);window.addEventListener(changeEvent,callback);return()=>{window.removeEventListener('storage',callback);window.removeEventListener(changeEvent,callback);};}
function snapshot(){
 try{
  const raw=localStorage.getItem(ANALYTICS_CHOICE_KEY);
  const choice=readAnalyticsChoice(raw);
  // A stored grant is usable only while it remains possible to replace it.
  if(choice==='granted')localStorage.setItem(ANALYTICS_CHOICE_KEY,raw!);
  return choice;
 }catch{return null;}
}
const serverSnapshot=()=>null;

export function Analytics({measurementId}:{measurementId?:string}){
 const consent=useSyncExternalStore(subscribe,snapshot,serverSnapshot);
 const [preferencesOpen,setPreferencesOpen]=useState(false);
 const [temporaryChoice,setTemporaryChoice]=useState<AnalyticsChoice|null>(null);
 const lastPage=useRef<string|null>(null);
 const pathname=usePathname();
 const choice=temporaryChoice??consent;
 const enabled=validMeasurementId(measurementId);
 useEffect(()=>{
  if(!enabled)return;
  function openSettings(event:MouseEvent){if((event.target as Element)?.closest('[data-analytics-settings]'))setPreferencesOpen(true);}
  document.addEventListener('click',openSettings);
  return()=>document.removeEventListener('click',openSettings);
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  if(choice!=='granted'){
   if(lastPage.current!==null){lastPage.current=null;stopAnalytics(measurementId);if(temporaryChoice===null)window.location.reload();}
   return;
  }
  if(!pathname)return;
  startAnalytics(measurementId);
  if(lastPage.current!==pathname){recordPageView(pathname);lastPage.current=pathname;}
 },[enabled,choice,pathname,measurementId,temporaryChoice]);
 if(!enabled)return null;
 function choose(next:AnalyticsChoice){
  let stored=false;
  try{localStorage.setItem(ANALYTICS_CHOICE_KEY,encodeAnalyticsChoice(next));stored=true;}catch{
   if(next==='denied'){try{localStorage.removeItem(ANALYTICS_CHOICE_KEY);stored=true;}catch{}}
  }
  const revoke=next==='denied'&&choice==='granted';
  setTemporaryChoice(stored?null:next);setPreferencesOpen(false);
  window.dispatchEvent(new Event(changeEvent));
  if(revoke){lastPage.current=null;stopAnalytics(measurementId!);if(stored)window.location.reload();}
 }
 const open=preferencesOpen||choice===null;
 return open?<section className="analytics-consent" role="region" aria-label="Privacy & analytics">
  <div><p className="eyebrow">YOUR CHOICE</p><h2>May we measure visits?</h2>
   <p>With your permission, DomoSenso uses Google Analytics to understand visits and page views. Measurement stays off without your consent.</p>
   <details><summary>Data and your choice</summary>
    <p>Operated by ZeroStoryPoints GmbH. Google Analytics uses cookies and processes usage and technical data. Processing may take place outside Switzerland. We do not enable advertising personalisation. Your choice and analytics cookies last up to 180 days. Change your consent at any time using “Analytics settings” in the footer.</p>
    <p><a href="https://policies.google.com/technologies/partner-sites">How Google uses data</a><span> · </span><a href="mailto:contact@zerostorypoints.com">Privacy contact</a></p>
   </details>
  </div>
  <div className="analytics-consent-actions">
   <button type="button" className="analytics-choice analytics-choice-neutral" onClick={()=>choose('denied')}>Decline</button>
   <button type="button" className="analytics-choice" onClick={()=>choose('granted')}>Allow analytics</button>
   {preferencesOpen&&choice!==null&&<button type="button" className="analytics-close" onClick={()=>setPreferencesOpen(false)}>Close</button>}
  </div>
 </section>:null;
}
