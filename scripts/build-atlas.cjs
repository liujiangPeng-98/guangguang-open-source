const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
// Run after Mapshaper topology-preserving simplification; see docs/13-map-refinement.md.
const raw=process.argv[2]; if(!raw)throw Error('Usage: node scripts/build-atlas.cjs <raw-directory> <output-directory>');
const target=path.resolve(process.argv[3]||path.join(__dirname,'../public/maps'));fs.mkdirSync(path.join(target,'provinces'),{recursive:true});
const source=name=>JSON.parse(fs.readFileSync(path.join(raw,name+(name==='provinces'?'-refined':'')+'.geojson'),'utf8')).features;
const project=([lng,lat])=>[+(1000*(lng+180)/360).toFixed(6),+(500*(90-lat)/180).toFixed(6)];
function shape(feature){
 const polys=feature.geometry.type==='Polygon'?[feature.geometry.coordinates]:feature.geometry.coordinates;
 let d='', bounds=[Infinity,Infinity,-Infinity,-Infinity], largest=null, largestArea=-1;
 for(const poly of polys){let outerBounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(let ri=0;ri<poly.length;ri++){
   const pts=poly[ri].map(project);let area=0;
   for(let i=0;i<pts.length;i++){const [x,y]=pts[i],next=pts[(i+1)%pts.length];area+=x*next[1]-next[0]*y;
    bounds=[Math.min(bounds[0],x),Math.min(bounds[1],y),Math.max(bounds[2],x),Math.max(bounds[3],y)];
    if(ri===0)outerBounds=[Math.min(outerBounds[0],x),Math.min(outerBounds[1],y),Math.max(outerBounds[2],x),Math.max(outerBounds[3],y)];
   }
   if(ri===0 && Math.abs(area)>largestArea){largestArea=Math.abs(area);largest=outerBounds;}
   d+=pts.map(([x,y],i)=>(i?'L':'M')+x+','+y).join('')+'Z';
  }
 }
 const extent=b=>Math.max(b[2]-b[0],b[3]-b[1]);
 const focusBounds=largest && (extent(bounds)>3*extent(largest) || bounds[2]-bounds[0]>500)?largest:undefined;
 return {d,bounds,...(focusBounds?{focusBounds}:{})};
}
const originalProvinces=new Map(JSON.parse(fs.readFileSync(path.join(raw,'provinces.geojson'),'utf8')).features.map(f=>[f.properties.adm1_code,f]));
const countryRaw=source('countries');const countryLookup=new Map();const countries=[];
for(const f of countryRaw){const p=f.properties;if(p.ADM0_A3==='ATA')continue;const code=p.ADM0_A3==='TWN'?'TW':p.ISO_A2==='-99'?p.ADM0_A3:p.ISO_A2;const geo=shape(f);const c={id:code,countryCode:code,name:p.NAME_ZH||p.NAME,center:[p.LABEL_X,p.LABEL_Y],...geo};countryLookup.set(code,c);countries.push(c);}
const china=countryLookup.get('CN');china.name='中国';
// Display the three special regions within the China province selector.
for(const code of ['HK','MO','TW']){const region=countryLookup.get(code);if(region){china.d+=region.d;china.bounds=[Math.min(china.bounds[0],region.bounds[0]),Math.min(china.bounds[1],region.bounds[1]),Math.max(china.bounds[2],region.bounds[2]),Math.max(china.bounds[3],region.bounds[3])];}}
const visibleCountries=countries.filter(c=>!['HK','MO','TW'].includes(c.id));
const groups=new Map(visibleCountries.map(c=>[c.id,[]]));
for(const f of source('provinces')){const p=f.properties;const parent=p.iso_a2==='-99'?p.adm0_a3:p.iso_a2;if(['TW','HK','MO'].includes(parent))continue;if(!groups.has(parent)||!p.name)continue;const full=f.geometry?f:originalProvinces.get(p.adm1_code);if(!full?.geometry)continue;const geo=shape(full);groups.get(parent).push({id:p.adm1_code,countryCode:parent,name:p.name_zh||p.name,center:[p.longitude,p.latitude],...geo});}
const cn=groups.get('CN');const islands=cn.find(r=>r.name==='西沙群岛');const hainan=cn.find(r=>r.name==='海南省');if(islands&&hainan){hainan.d+=islands.d;hainan.bounds=[Math.min(hainan.bounds[0],islands.bounds[0]),Math.min(hainan.bounds[1],islands.bounds[1]),Math.max(hainan.bounds[2],islands.bounds[2]),Math.max(hainan.bounds[3],islands.bounds[3])];groups.set('CN',cn.filter(r=>r!==islands));}
for(const [code,name] of [['HK','香港特别行政区'],['MO','澳门特别行政区'],['TW','台湾省']]){const c=countryLookup.get(code);if(c)groups.get('CN').push({...c,id:'CN-'+code,countryCode:'CN',name});}
for(const [code,regions] of groups)fs.writeFileSync(path.join(target,'provinces',code+'.json'),JSON.stringify(regions));
fs.writeFileSync(path.join(target,'countries.json'),JSON.stringify(visibleCountries));
const catalog=visibleCountries.map(({d,bounds,focusBounds,...c})=>({...c,provinceCount:groups.get(c.id).length}));
fs.writeFileSync(path.join(target,'catalog.json'),JSON.stringify(catalog));
fs.writeFileSync(path.join(target,'NOTICE.txt'),`Simplified atlas for scenery journaling. Not a navigation map.\nSource: Natural Earth, public domain. https://www.naturalearthdata.com/about/terms-of-use/\nCountry data: ne_50m_admin_0_countries; subdivisions: ne_10m_admin_1_states_provinces.\nRetrieved: 2026-10-09. Country outlines retain the full 50m source detail. Province boundaries simplified as shared topology using Mapshaper, 500 m weighted threshold; projected equirectangular.\nHong Kong, Macao and Taiwan are grouped under the China selector.\n`);
const sha=name=>crypto.createHash('sha256').update(fs.readFileSync(path.join(raw,name+'.geojson'))).digest('hex');
fs.writeFileSync(path.join(raw,'refined-source-manifest.json'),JSON.stringify({countries:sha('countries'),provinces:sha('provinces')},null,2));
console.log(JSON.stringify({countries:visibleCountries.length,provinces:[...groups.values()].reduce((n,a)=>n+a.length,0),chinaProvinces:groups.get('CN').length,countryBytes:fs.statSync(path.join(target,'countries.json')).size,chinaBytes:fs.statSync(path.join(target,'provinces/CN.json')).size}));

