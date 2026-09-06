import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOverstandExport } from '../src/overstand.js';
import { fingerboardSections } from '../src/fingerboard.js';
import { makeTemplatePair } from '../src/template-pair.js';
import { PRESETS } from '../src/profile.js';
const parameters={instrument_name:'Hoskins 390',vsl:390,fingerboard_length:256,
  fingerboard_width_at_nut:42,fingerboard_width_at_end:62,fingerboard_radius:55,
  fb_visible_height_at_nut:3,fb_visible_height_at_join:5,fb_blend_percent:75};
const input=JSON.stringify({metadata:{version:'1.0'},parameters});

test('Overstand export maps measurements and name without inventing maximum thickness',()=>{
  const result=parseOverstandExport(input);
  assert.deepEqual(result,{dimensions:{nutWidth:42,endWidth:62,boardLength:256,stringLength:390},radius:55,name:'Hoskins 390'});
  const sections=fingerboardSections(result.dimensions);
  assert.equal(sections[0].width.toFixed(2),'43.71');
  assert.equal(sections[1].width.toFixed(2),'52.13');
  assert.throws(()=>makeTemplatePair(result.dimensions,PRESETS.meares1,result.name),/thickness/);
});
test('imported radius stays fixed at both sections with separately entered thicknesses',()=>{
  const result=parseOverstandExport(input);
  const pair=makeTemplatePair({...result.dimensions,topRadius:result.radius,thickness1:20,thickness7:22},PRESETS.meares1,'Hoskins');
  for(const section of pair.sections)assert.equal(section.profile.params.radius,55);
  assert.equal(pair.sections[0].template.name,'Hoskins F1');
  assert.equal(pair.sections[1].template.name,'Hoskins F7');
});
test('invalid imports fail before form values are applied',()=>{
  for(const input of ['{','null','[]','{}',JSON.stringify({parameters:{}})])assert.throws(()=>parseOverstandExport(input),RangeError);
  for(const patch of [{vsl:'390'},{vsl:0},{fingerboard_width_at_nut:-1},{fingerboard_radius:0},{instrument_name:12}])
    assert.throws(()=>parseOverstandExport(JSON.stringify({parameters:{...parameters,...patch}})),RangeError);
  const {fingerboard_radius,instrument_name,...minimal}=parameters;
  const result=parseOverstandExport(JSON.stringify({parameters:minimal}));
  assert.equal(result.radius,null);assert.equal(result.name,'');
});
