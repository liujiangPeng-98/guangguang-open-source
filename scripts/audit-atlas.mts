import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitRegion, mapInsets, MAX_ZOOM, type AtlasRegion } from '../src/maps/atlas.ts';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const countries: AtlasRegion[]=JSON.parse(fs.readFileSync(root+'/public/maps/countries.json','utf8'));
const provinces: AtlasRegion[]=countries.flatMap(c=>JSON.parse(fs.readFileSync(root+'/public/maps/provinces/'+c.id+'.json','utf8')));
const errors: string[]=[];
const viewports=[[284,520],[354,562],[394,620],[900,650]];
const rows=[...countries,...provinces].map((region,index)=>{
 const isProvince=index>=countries.length;
 const b=region.focusBounds??region.bounds;
 if(!region.d || !b.every(Number.isFinite) || b[2]<=b[0] || b[3]<=b[1])errors.push(region.id+': invalid geometry');
 const views=viewports.map(([width,height])=>{
  const c=fitRegion(region,width,height,isProvince),scale=width*c.zoom/1000,inset=mapInsets(width,isProvince);
  const pixels=[(b[0]-c.x)*scale+width/2,(b[1]-c.y)*scale+height/2,(b[2]-c.x)*scale+width/2,(b[3]-c.y)*scale+height/2];
  const majorPixels=Math.max((b[2]-b[0])*scale,(b[3]-b[1])*scale);
  const fits=pixels[0]>=inset.left-.01 && pixels[1]>=inset.top-.01 && pixels[2]<=width-inset.right+.01 && pixels[3]<=height-inset.bottom+.01;
  if(!fits || majorPixels<100 || !Number.isFinite(c.zoom) || c.zoom>MAX_ZOOM)errors.push(region.id+': '+width+'px '+JSON.stringify({fits,majorPixels,zoom:c.zoom}));
  return {width,height,zoom:c.zoom,majorPixels,fits};
 });
 return {id:region.id,name:region.name,countryCode:region.countryCode,focusMainland:!!region.focusBounds,views};
});
const report={date:'2026-10-14',countries:countries.length,provinces:provinces.length,regionCount:rows.length,viewportChecks:rows.length*viewports.length,maxZoom:MAX_ZOOM,errors,focusMainlandCount:rows.filter(r=>r.focusMainland).length,highestZoom:Math.max(...rows.flatMap(r=>r.views.map(v=>v.zoom))),rows};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,rows:undefined,errors:errors.slice(0,25)}));
if(errors.length)process.exitCode=1;
