import test from 'node:test';
import assert from 'node:assert/strict';
import { makeTemplatePair, exportTemplatePairSvg } from '../src/template-pair.js';
import { PRESETS, construction } from '../src/profile.js';
const dimensions={nutWidth:42,endWidth:64,boardLength:450,stringLength:700,thickness1:20,thickness7:22};
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('pair uses calculated widths and independently supplied fret thicknesses',()=>{
  const pair=makeTemplatePair(dimensions,PRESETS.meares1,'Viol');
  const shared=construction(PRESETS.meares1);
  for(const s of pair.sections){
    near(s.profile.params.width,42+22*s.distance/450);
    near(s.profile.params.thickness,dimensions[`thickness${s.fret}`]);
    near(-s.profile.bottom,dimensions[`thickness${s.fret}`]);
    near(s.profile.params.radius/s.width,PRESETS.meares1.radius/PRESETS.meares1.width);
    near((s.profile.edgeY-s.profile.corner.sideTopY)/s.profile.params.thickness,
      (shared.edgeY-shared.corner.sideTopY)/PRESETS.meares1.thickness);
    assert.equal(s.template.name,`Viol F${s.fret}`);
    s.template.contact.forEach(([x,y],i)=>{
      near(x,s.profile.underside[i][0]);near(y-s.template.height+s.profile.sideY,s.profile.underside[i][1]);
    });
  }
  const changed=makeTemplatePair({...dimensions,thickness7:24},PRESETS.meares1,'Viol');
  assert.deepEqual(changed.sections[0],pair.sections[0]);
  assert.notDeepEqual(changed.sections[1].template.contact,pair.sections[1].template.contact);
});
test('pair export has separate nonoverlapping plates at 1:1 scale',()=>{
  const pair=makeTemplatePair(dimensions,PRESETS.meares1,'Viol'),svg=exportTemplatePairSvg(pair);
  const [a,b]=pair.sections;
  near(b.offset[0]-b.template.width/2-(a.offset[0]+a.template.width/2),10);
  for(const s of pair.sections)for(const [x,y]of s.template.outer){
    assert.ok(x+s.offset[0]>=2-1e-9&&x+s.offset[0]<=pair.width-2+1e-9);
    assert.ok(y+s.offset[1]>=2-1e-9&&y+s.offset[1]<=pair.height-2+1e-9);
  }
  assert.equal((svg.match(/<path /g)||[]).length,2);assert.doesNotMatch(svg,/<text|transform=/);
  const width=Number(svg.match(/width="([^"]+)mm"/)[1]),height=Number(svg.match(/height="([^"]+)mm"/)[1]);
  const box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
  near(width,box[2]);near(height,box[3]);
});
test('either invalid section or stencil prevents exporting a partial pair',()=>{
  for(const patch of [{thickness1:0},{thickness7:NaN},{thickness1:1},{boardLength:100}])
    assert.throws(()=>makeTemplatePair({...dimensions,...patch},PRESETS.meares1,'Viol'),RangeError);
  for(const name of ['','<script>','W'.repeat(29)])assert.throws(()=>makeTemplatePair(dimensions,PRESETS.meares1,name),RangeError);
});
