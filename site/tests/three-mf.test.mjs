import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTemplatePair, exportTemplatePairSvg } from '../src/template-pair.js';
import { PRESETS } from '../src/profile.js';
import { extrudeTemplate, exportTemplatePair3mf, pairModelXml, validatePrintThickness } from '../src/three-mf.js';
const dimensions={nutWidth:42,endWidth:62,boardLength:256,stringLength:390,thickness1:20,thickness7:22,topRadius:55};
const pair=makeTemplatePair(dimensions,PRESETS.meares1,'Hoskins');
const area=ring=>Math.abs(ring.reduce((sum,[x,y],i)=>{const q=ring[(i+1)%ring.length];return sum+x*q[1]-q[0]*y;},0)/2);

function checkMesh(mesh,template,thickness){
  const edges=new Map(),neighbors=mesh.vertices.map(()=>new Set());let volume=0;
  for(const tri of mesh.triangles){
    const [a,b,c]=tri.map(i=>mesh.vertices[i]);
    const u=b.map((v,i)=>v-a[i]),v=c.map((v,i)=>v-a[i]);
    assert.ok(Math.hypot(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0])>1e-12,'no zero-area faces');
    volume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let i=0;i<3;i++){
      const a=tri[i],b=tri[(i+1)%3],key=a<b?`${a},${b}`:`${b},${a}`;
      const e=edges.get(key)||{count:0,direction:0};e.count++;e.direction+=a<b?1:-1;edges.set(key,e);
      neighbors[a].add(b);neighbors[b].add(a);
    }
  }
  for(const e of edges.values()){assert.equal(e.count,2,'watertight edge');assert.equal(e.direction,0,'consistent winding');}
  const visited=new Set([0]),queue=[0];
  for(let i=0;i<queue.length;i++)for(const n of neighbors[queue[i]])if(!visited.has(n)){visited.add(n);queue.push(n);}
  assert.equal(visited.size,mesh.vertices.length,'one connected solid per plate');
  assert.equal(mesh.vertices.length-edges.size+mesh.triangles.length,2-2*template.holes.length,'every stencil hole remains open');
  const expected=(area(template.outer)-template.holes.reduce((sum,h)=>sum+area(h),0))*thickness;
  assert.ok(volume>0,'outward normals');assert.ok(Math.abs(volume-expected)<.001,'volume equals stencil area times thickness');
  assert.equal(Math.min(...mesh.vertices.map(v=>v[2])),0);
  assert.equal(Math.max(...mesh.vertices.map(v=>v[2])),thickness);
}

test('default 3MF extrudes two closed stencils to 1.5 mm with no filled counters',()=>{
  for(const section of pair.sections)checkMesh(extrudeTemplate(section,pair.height),section.template,1.5);
});
test('print thickness changes Z only, leaving SVG and template contact unchanged',()=>{
  const svg=exportTemplatePairSvg(pair);
  for(const section of pair.sections){
    const first=extrudeTemplate(section,pair.height),second=extrudeTemplate(section,pair.height,2.7);
    assert.deepEqual(first.triangles,second.triangles);
    assert.deepEqual(first.vertices.map(v=>v.slice(0,2)),second.vertices.map(v=>v.slice(0,2)));
    checkMesh(second,section.template,2.7);
  }
  assert.equal(exportTemplatePairSvg(pair),svg);
  for(const value of [0,-1,NaN,Infinity,.01,21])assert.throws(()=>validatePrintThickness(value),RangeError);
});
test('all supported letter and digit shapes extrude as connected manifold plates',()=>{
  for(const name of ['ABCD','EFGH','IJKL','MNOP','QRST','UVWX','YZ','abcd','efgh','ijkl','mnop','qrst','uvwx','yz','01234','56789','. - ( )']){
    const p=makeTemplatePair(dimensions,PRESETS.meares1,name);
    checkMesh(extrudeTemplate(p.sections[0],p.height),p.sections[0].template,1.5);
  }
});
test('3MF declares millimetres and two named objects with separate build items',()=>{
  const xml=pairModelXml(pair);
  assert.match(xml,/unit="millimeter"/);
  assert.equal((xml.match(/<object /g)||[]).length,2);assert.equal((xml.match(/<item /g)||[]).length,2);
  assert.match(xml,/name="Hoskins F1"/);assert.match(xml,/name="Hoskins F7"/);
  const archive=exportTemplatePair3mf(pair);assert.ok(archive instanceof Uint8Array);
  assert.equal(new DataView(archive.buffer).getUint32(0,true),0x04034b50);
});
