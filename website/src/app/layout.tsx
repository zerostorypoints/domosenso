import type {Metadata} from 'next';
import {Header,Footer} from '@/components/site';
import './globals.css';
import './catalog.css';
import {Analytics} from '@/components/analytics';
export const metadata:Metadata={metadataBase:new URL('https://domosenso.org'),title:{default:'DomoSenso — a framework for your Home Assistant setup',template:'%s | DomoSenso'},description:'Build Home Assistant setups with AI coding agents and reusable components.',icons:{icon:'/icon.svg'},verification:{other:process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION?{'msvalidate.01':process.env.NEXT_PUBLIC_BING_SITE_VERIFICATION}:{}}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><Header/><main id="main" tabIndex={-1}>{children}</main><Footer/><Analytics measurementId={process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID}/></body></html>}
