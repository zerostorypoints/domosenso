import {filterComponents,readFilters,filterQuery} from './browser';
const entries=[{id:'plants',name:'Plant care',outcome:'Soil moisture',categories:['climate'],hardware:'required',ui:'consumer',deviceNames:['Mi Flora']},{id:'weather',name:'Weather',outcome:'Forecast',categories:['climate'],hardware:'none',ui:'none',deviceNames:[]}];
test('combines filters and searches device names without changing source order',()=>{
 expect(filterComponents(entries,{q:'flora',purpose:'climate',hardware:'required',ui:'consumer'}).map(c=>c.id)).toEqual(['plants']);
 expect(filterComponents(entries,{q:' ',purpose:'climate',hardware:'none',ui:''}).map(c=>c.id)).toEqual(['weather']);
 expect(filterComponents(entries,{q:'absent',purpose:'',hardware:'',ui:''})).toEqual([]);
});
test('query state round trips and rejects unknown filter values',()=>{
 const filters={q:'été & soil',purpose:'climate',hardware:'required',ui:'consumer'};
 expect(readFilters(filterQuery(filters))).toEqual(filters);
 expect(readFilters('?hardware=unknown&ui=alien&purpose=other').hardware).toBe('');
});

test('real catalog supports capability discovery, including source summaries',()=>{
 const ids=(q:string)=>filterComponents(componentSearchEntries,{...readFilters(''),q}).map(c=>c.id);
 expect(ids('soil moisture')).toContain('plants');
 expect(ids('retention')).toContain('backup');
 expect(ids('brightness')).toContain('lights');
 expect(ids('Bluetooth')).toContain('bermuda-presence');
});
import {componentSearchEntries} from './catalog-search';
