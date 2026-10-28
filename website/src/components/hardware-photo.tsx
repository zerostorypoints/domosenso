import Image from 'next/image';
import {assets} from '@/lib/content';

export function HardwarePhoto({src,detail=false,guideHref}:{src:string;detail?:boolean;guideHref?:string}) {
  const photo=assets.find(asset=>asset.path===src);
  if(!photo||!('imageSourceUrl' in photo))return null;
  return <figure className={`hardware-photo${detail?' hardware-photo-detail':''}`}>
    <a className="hardware-photo-image" href={guideHref??src} target={guideHref?undefined:'_blank'} rel={guideHref?undefined:'noreferrer'} aria-label={`${guideHref?'Installation guide':'Open product photo'}: ${photo.alt}`}>
      <Image src={src} width={photo.width} height={photo.height} alt={photo.alt} sizes="(max-width: 650px) 100vw, (max-width: 1050px) 50vw, 33vw"/>
    </a>
    <figcaption>Photo: <a href={photo.sourceUrl} target="_blank" rel="noreferrer">{photo.credit} ↗</a>{'licenseUrl' in photo&&photo.licenseUrl&&<> · <a href={photo.licenseUrl} target="_blank" rel="noreferrer">{photo.license==='CC-BY-NC-SA-4.0'?'CC BY-NC-SA 4.0':'Usage terms'}</a></>}</figcaption>
  </figure>;
}
