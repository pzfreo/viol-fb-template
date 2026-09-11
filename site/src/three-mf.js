import { triangulatePolygon } from './vendor/earcut.js';

export const DEFAULT_PRINT_THICKNESS = 1.5;
export function validatePrintThickness(thickness) {
  if(!Number.isFinite(thickness)||thickness<0.1||thickness>20)
    throw new RangeError('Enter a print thickness between 0.1 and 20 mm.');
}
const meshNumber=value=>Number(value.toFixed(6));
const ringArea=ring=>ring.reduce((sum,[x,y],i)=>{
  const next=ring[(i+1)%ring.length];return sum+x*next[1]-next[0]*y;
},0)/2;
const triangleArea=(a,b,c)=>((b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]))/2;

function capEdges(caps) {
  const edges=new Map();
  for(const triangle of caps)for(let i=0;i<3;i++){
    const a=triangle[i],b=triangle[(i+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
    if(!edges.has(key))edges.set(key,{a,b,count:1});else edges.get(key).count++;
  }
  return edges;
}
function conformCaps(initial,points) {
  // Earcut is a rendering triangulator and may leave collinear T-junctions
  // along bridges between holes. Split those edges before building walls.
  let caps=initial;
  for(let pass=0;pass<8;pass++){
    const edges=capEdges(caps),splits=new Map();
    for(const [key,{a,b,count}]of edges){
      if(count!==1)continue;
      const [x,y]=points[a],dx=points[b][0]-x,dy=points[b][1]-y,length2=dx*dx+dy*dy;
      const intermediate=[];
      for(let i=0;i<points.length;i++){
        if(i===a||i===b)continue;
        const px=points[i][0]-x,py=points[i][1]-y,t=(px*dx+py*dy)/length2;
        if(t>1e-10&&t<1-1e-10&&Math.abs(px*dy-py*dx)<1e-10)
          intermediate.push([t,i]);
      }
      if(intermediate.length)splits.set(key,intermediate.sort((a,b)=>a[0]-b[0]).map(p=>p[1]));
    }
    if(!splits.size)return caps;
    const next=[];
    for(const tri of caps){
      let split=false;
      for(let i=0;i<3;i++){
        const a=tri[i],b=tri[(i+1)%3],c=tri[(i+2)%3],key=a<b?`${a},${b}`:`${b},${a}`;
        if(!splits.has(key))continue;
        const edge=edges.get(key),middle=splits.get(key);
        const chain=[a,...(edge.a===a?middle:[...middle].reverse()),b];
        for(let j=0;j<chain.length-1;j++)next.push([chain[j],chain[j+1],c]);
        split=true;break;
      }
      if(!split)next.push(tri);
    }
    caps=next;
  }
  throw new RangeError('The stencil edges could not be joined cleanly. Try a different name.');
}

export function extrudeTemplate(section, pairHeight, thickness=DEFAULT_PRINT_THICKNESS) {
  validatePrintThickness(thickness);
  // Reflect SVG's downward Y into a right-handed, Z-up model. Lettering reads
  // correctly when viewed from above. Both parts sit flat at Z=0.
  const rings=[section.template.outer,...section.template.holes].map(ring=>{
    const points=ring.map(([x,y])=>[meshNumber(x+section.offset[0]),meshNumber(pairHeight-y-section.offset[1])]);
    return points.filter((p,i)=>{
      const previous=points[(i+points.length-1)%points.length];
      return p[0]!==previous[0]||p[1]!==previous[1];
    });
  });
  const points=rings.flat(),holes=[];
  let index=rings[0].length;
  for(const ring of rings.slice(1)){holes.push(index);index+=ring.length;}
  const indices=triangulatePolygon(points.flat(),holes,2),initialCaps=[];
  let area=0;
  for(let i=0;i<indices.length;i+=3){
    let [a,b,c]=indices.slice(i,i+3);
    const signed=triangleArea(points[a],points[b],points[c]);
    if(signed===0)continue;
    if(signed<0)[b,c]=[c,b];
    area+=Math.abs(signed);initialCaps.push([a,b,c]);
  }
  const expected=Math.abs(ringArea(rings[0]))-rings.slice(1).reduce((sum,r)=>sum+Math.abs(ringArea(r)),0);
  if(expected<=0||Math.abs(area-expected)>Math.max(1e-6,expected*1e-8))
    throw new RangeError('The stencil could not be triangulated accurately. Try a different name.');
  // Walls follow the cap's boundary, including holes. This also handles any
  // collinear vertices removed by triangulation without leaving open seams.
  const caps=conformCaps(initialCaps,points),edges=capEdges(caps);
  const count=points.length;
  const vertices=[...points.map(([x,y])=>[x,y,0]),...points.map(([x,y])=>[x,y,thickness])];
  const triangles=[];
  for(const [a,b,c]of caps)triangles.push([c,b,a],[a+count,b+count,c+count]);
  for(const {a,b,count:uses}of edges.values()){
    if(uses>2)throw new RangeError('The stencil mesh has an invalid edge. Try a different name.');
    if(uses===1)triangles.push([a,b,b+count],[a,b+count,a+count]);
  }
  // Remove unused vertices to keep each object a clean mesh.
  const used=[...new Set(triangles.flat())],lookup=new Map(used.map((value,i)=>[value,i]));
  return {name:section.template.name,vertices:used.map(i=>vertices[i]),triangles:triangles.map(t=>t.map(i=>lookup.get(i)))};
}

const xmlAttribute=value=>value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
export function pairModelXml(pair,thickness=DEFAULT_PRINT_THICKNESS) {
  validatePrintThickness(thickness);
  const objects=pair.sections.map((section,i)=>{
    const mesh=extrudeTemplate(section,pair.height,thickness);
    const vertices=mesh.vertices.map(([x,y,z])=>`<vertex x="${x}" y="${y}" z="${z}"/>`).join('');
    const triangles=mesh.triangles.map(([a,b,c])=>`<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join('');
    return `<object id="${i+1}" type="model" name="${xmlAttribute(mesh.name)}"><mesh><vertices>${vertices}</vertices><triangles>${triangles}</triangles></mesh></object>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><metadata name="Application">Fingerboard Studio</metadata><metadata name="Description">${pair.sections.map(({fret,template})=>`F${fret}: corner rounding drops the edge ${template.cornerDrop.toFixed(2)} mm, leaving a ${template.flatSide.toFixed(2)} mm flat side`).join('; ')}. The contact edge follows that rounding, so these plates match only those amounts.</metadata><resources>${objects.join('')}</resources><build>${pair.sections.map((_,i)=>`<item objectid="${i+1}"/>`).join('')}</build></model>`;
}

// A minimal ZIP writer using stored entries. No runtime dependency or network
// request is needed; 3MF's XML parts remain standard OPC package entries.
function crc32(bytes) {
  let crc=0xffffffff;
  for(const byte of bytes){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  return (crc^0xffffffff)>>>0;
}
function zipStored(files) {
  const encoder=new TextEncoder(),local=[],central=[];
  let offset=0;
  for(const [name,text]of Object.entries(files)){
    const filename=encoder.encode(name),data=encoder.encode(text),crc=crc32(data);
    const header=new Uint8Array(30+filename.length),h=new DataView(header.buffer);
    h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);
    h.setUint16(12,33,true); // 1980-01-01, deterministic DOS date.
    h.setUint32(14,crc,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);
    h.setUint16(26,filename.length,true);header.set(filename,30);
    const entry=new Uint8Array(46+filename.length),c=new DataView(entry.buffer);
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);
    c.setUint16(14,33,true);c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);
    c.setUint16(28,filename.length,true);c.setUint32(42,offset,true);entry.set(filename,46);
    local.push(header,data);central.push(entry);offset+=header.length+data.length;
  }
  const centralSize=central.reduce((sum,entry)=>sum+entry.length,0),end=new Uint8Array(22),e=new DataView(end.buffer);
  e.setUint32(0,0x06054b50,true);e.setUint16(8,central.length,true);e.setUint16(10,central.length,true);
  e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+22);let position=0;
  for(const part of [...local,...central,end]){result.set(part,position);position+=part.length;}
  return result;
}
export function exportTemplatePair3mf(pair,thickness=DEFAULT_PRINT_THICKNESS) {
  return zipStored({
    '[Content_Types].xml':'<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>',
    '_rels/.rels':'<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>',
    '3D/3dmodel.model':pairModelXml(pair,thickness),
  });
}
