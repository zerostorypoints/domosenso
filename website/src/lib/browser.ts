export type Filters={q:string;purpose:string;hardware:string;ui:string};
export const emptyFilters:Filters={q:'',purpose:'',hardware:'',ui:''};
export const purposes:Record<string,string>={presence:'Presence',climate:'Climate & plants','lighting-shading':'Lighting & shading','media-display':'Media & display',utilities:'Utilities'};
export const hardwareLabels:Record<string,string>={required:'Hardware required',optional:'Optional hardware',none:'No dedicated device'};
export const uiLabels:Record<string,string>={own:'Own view or card',consumer:'Shown through another component',none:'No bundled view'};
export type SearchEntry={id:string;name:string;outcome:string;categories:string[];hardware:string;ui:string;deviceNames:string[];summary?:string;capabilities?:string[]};
export function readFilters(search:string):Filters{
 const params=new URLSearchParams(search);
 const known=(key:string,options:Record<string,string>)=>Object.hasOwn(options,params.get(key)??'')?params.get(key)!:'';
 return {q:params.get('q')??'',purpose:known('purpose',purposes),hardware:known('hardware',hardwareLabels),ui:known('ui',uiLabels)};
}
export function filterQuery(filters:Filters){const params=new URLSearchParams();for(const [k,v]of Object.entries(filters))if(v)params.set(k,v);return params.size?'?'+params.toString():'';}
export function filterComponents<T extends SearchEntry>(entries:T[],filters:Filters):T[]{
 const query=filters.q.trim().toLocaleLowerCase('en');
 return entries.filter(c=>(!query||[c.id,c.name,c.outcome,c.summary??'',...c.deviceNames,...(c.capabilities??[])].join(' ').toLocaleLowerCase('en').includes(query))&&(!filters.purpose||c.categories.includes(filters.purpose))&&(!filters.hardware||c.hardware===filters.hardware)&&(!filters.ui||c.ui===filters.ui));
}
