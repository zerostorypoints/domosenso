import {catalog,componentName} from './catalog';
import {editorial,devices} from './content';
/** Search the same released facts and capabilities the component page explains. */
export const componentSearchEntries=editorial.map(entry=>{
 const release=catalog.find(c=>c.id===entry.id)!;
 return {...entry,name:componentName(entry.id),summary:release.summary,
  deviceNames:entry.deviceIds.map(id=>devices.find(d=>d.id===id)?.title??id),
  capabilities:[...entry.views.map(view=>view.title),...entry.scenario.states.flatMap(state=>[state.headline,state.detail]),...entry.setup,...release.requirements.map(r=>r.kind),...release.optionalRequirements.map(r=>r.kind)]};
});
