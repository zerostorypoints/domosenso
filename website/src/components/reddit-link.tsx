import Image from 'next/image';

export function RedditLink({label}:{label?:string}) {
  return <a className="reddit-link" href="https://www.reddit.com/r/domosenso/" aria-label={label??'DomoSenso community on Reddit'} title="Contact and discuss integrations or components on r/domosenso">
    <Image src="/icons/reddit.svg" width={24} height={24} alt="" aria-hidden="true"/>
    {label&&<span>{label}</span>}
  </a>;
}
