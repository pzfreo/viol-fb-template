import test from 'node:test';
import assert from 'node:assert/strict';
import { fretDistance, fingerboardSections, scaleSection } from '../src/fingerboard.js';
import { generate, PRESETS, SHAPING_MARGIN, flatSide } from '../src/profile.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);
const dimensions={nutWidth:30,endWidth:60,boardLength:400,stringLength:600};

test('fret distances agree with Overstand and the octave halves the string',()=>{
  near(fretDistance(600,0),0);near(fretDistance(600,12),300);
  near(fretDistance(600,1),33.67541239098388);
  near(fretDistance(600,7),199.5480437489897);
});
test('widths interpolate at actual fret distances and support parallel sides',()=>{
  const sections=fingerboardSections(dimensions);
  for(const s of sections)near(s.width,30+30*s.distance/400);
  for(const s of fingerboardSections({...dimensions,endWidth:30}))near(s.width,30);
  const atEnd=fingerboardSections({...dimensions,boardLength:fretDistance(600,7)});
  near(atEnd[1].width,60);assert.equal(atEnd[1].onBoard,true);
});
test('out-of-board sections are marked rather than clamped or extrapolated',()=>{
  const sections=fingerboardSections({...dimensions,boardLength:100});
  assert.equal(sections[0].onBoard,true);
  assert.equal(sections[1].onBoard,false);assert.equal(sections[1].width,null);
  for(const value of [0,-1,NaN,Infinity])for(const key of Object.keys(dimensions))
    assert.throws(()=>fingerboardSections({...dimensions,[key]:value}),RangeError);
  assert.throws(()=>fingerboardSections({...dimensions,boardLength:700}),RangeError);
});
test('shared profile scales consistently at both sections, including corner drop',()=>{
  const base=generate(PRESETS.meares1);
  const sections=fingerboardSections(dimensions);
  let parameters=base.params;
  for(const s of [...sections,sections[0]]){
    parameters=scaleSection(parameters,s.width);
    const p=generate(parameters),scale=s.width/base.params.width;
    near(p.params.width,s.width);
    near(p.edgeY-p.corner.sideTopY,(base.edgeY-base.corner.sideTopY)*scale);
    // The filing allowance is a workshop constant, not a proportion, so a
    // smaller section keeps the same 0.1 mm of flat rather than a scaled share.
    // Similarity therefore holds everywhere except by that fixed amount.
    near(p.flatSideHeight,SHAPING_MARGIN);
    near(flatSide(p.params),(p.edgeY-p.corner.sideTopY)+SHAPING_MARGIN);
    p.points.forEach(([x,y],i)=>{
      assert.ok(Math.hypot(x-base.points[i][0]*scale,y-base.points[i][1]*scale)<=SHAPING_MARGIN,
        'departs from exact similarity by no more than the filing allowance');
    });
  }
});
