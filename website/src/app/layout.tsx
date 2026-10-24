import type {Metadata} from 'next';
import {Header,Footer} from '@/components/site';
import './globals.css';
export const metadata:Metadata={metadataBase:new URL('https://domosenso.org'),title:{default:'DomoSenso — a framework for your Home Assistant setup',template:'%s | DomoSenso'},description:'Build Home Assistant setups with AI coding agents and reusable components.',icons:{icon:'/icon.svg'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body><a className="skip" href="#main">Skip to content</a><Header/><main id="main" tabIndex={-1}>{children}</main><Footer/></body></html>}
