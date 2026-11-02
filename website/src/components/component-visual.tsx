import type {CSSProperties} from 'react';

/** Deliberately schematic: these visuals explain behavior, not a real HA dashboard. */
export function ComponentVisual({id,level=55,index=0}:{id:string;level?:number;index?:number}) {
 return <div className={`component-visual visual-${id}`} style={{'--level':`${level}%`,'--strength':level/100} as CSSProperties} aria-hidden="true">
  {id==='ramka'?<div className={`visual-tablet ${index===3?'sleeping':''}`}><div className="tablet-top"><i/><span>DOMOSENSO</span><span>09:41</span></div><div className="tablet-body"><strong>{['21.4°','Controls','♫',''][index]??'21.4°'}</strong><div className="tablet-tiles"><i/><i/><i/></div></div><span className="tablet-dot"/></div>:
   id==='plants'?<div className="plant-drawing"><div className="leaf leaf-a"/><div className="leaf leaf-b"/><div className="leaf leaf-c"/><div className="plant-stem"/><div className="plant-pot"><span style={{height:`${level}%`}}/></div><div className="plant-probe"/></div>:
   id==='awnings'?<div className="awning-house"><div className="awning-fabric" style={{height:`${25+level*.65}px`}}/><div className="house-window"/><span className="signal-dot"/></div>:
   id==='lights'?<div className="light-room"><div className="light-cone"/><div className="light-wire"/><div className="light-shade"/><div className="room-table"/></div>:
   id==='bermuda-presence'?<div className="presence-map"><span>Living room</span><span>Office</span><span>Hall</span><span>Bedroom</span><i className={`person-dot position-${index}`}/><b className="proxy-dot"/></div>:
   id==='media'?<div className={`record-player ${index===2?'record-off':''}`}><div className="vinyl"><i/></div><div className="record-label">{index===1?'Ⅱ':index===2?'○':'♫'}</div><div className="sound-bars">{[14,25,42,31,48,22,14].map((h,i)=><i key={i} style={{height:index===0?h:6}}/>)}</div></div>:
   id==='calendar'?<div className="calendar-sheet"><span>YOUR DAY</span><strong>{index===0?'28':'29'}</strong><i/><i/><i/></div>:
   id==='backup'?<div className="backup-stack"><div/><div/><div/><strong>{index===0?'✓':'!'}</strong><span>{index===0?'RECORDED':'CHECK BACKUP'}</span></div>:
   id==='audio-sensor'?<div className={`sound-board ${index===2?'sound-offline':''}`}><div className="echo-board"><i/><span>ATOM ECHO</span></div>{index===0?<div className="spectrum">{[30,44,58,72,64,80,92,76,60,70,52,40,46,34,26,18].map((h,i)=><i key={i} style={{height:`${h*level/100}%`}}/>)}</div>:index===1?<div className="level-meter"><span style={{width:`${level}%`}}/><b>{level} dB</b></div>:<svg className="classic-wave" viewBox="0 0 160 40"><path d="M0 20 Q10 4 20 20 T40 20 T60 20 T80 20 T100 20 T120 20 T140 20 T160 20"/></svg>}</div>:
   id==='floorplan'?<div className={`floor-sketch map-${index}`}><div className="fp-room fp-living"><span>Living</span><i className="fp-dot fp-a"/></div><div className="fp-room fp-kitchen"><span>Kitchen</span></div><div className="fp-room fp-office"><span>Office</span><i className="fp-dot fp-b"/></div><div className="fp-room fp-bed"><span>Bedroom</span></div><b className="fp-open"/></div>:
   id==='weather'?<div className="weather-scene"><div className="weather-sun"/>{index>0&&<><div className="weather-cloud"/><div className="weather-rain">╱ ╱ ╱</div></>}<span>{index===0?'18°':'13°'}</span></div>:
   <div className="climate-gauge"><div className="gauge-ring"><strong>{index===0?'21.4°':'780'}<small>{index===0?'TEMPERATURE':'CO₂ · PPM'}</small></strong></div><div className="gauge-dots"><i/><i/><i/><i/><i/></div></div>}
  <span className="visual-caption">{id==='ramka'?'A screen with a purpose':'ILLUSTRATIVE / SAMPLE DATA'}</span>
 </div>;
}
