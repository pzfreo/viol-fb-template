import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, FLAT_SIDE_FRACTION, SHAPING_MARGIN, flatSide, radiusForCornerDrop, surface, bezier, curveRadius, cornerPoint, validate, generate, exportSvg } from '../src/profile.js';
import { makeTemplate, exportTemplateSvg } from '../src/template.js';
import { STENCIL_FONT } from '../src/stencil-font.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const curvature=s=>Math.abs(s.second)/(1+s.first*s.first)**1.5;

test('corner easing leaves the entire quartic underside and its template contact unchanged',()=>{
  const QUARTIC={...DEFAULTS,model:'quartic'};
  const baseline=generate({...QUARTIC,blend:0});
  for(const blend of [.25,.5,1,1.5]){
    const p=generate({...QUARTIC,blend});
    assert.deepEqual(p.underside,baseline.underside);
    assert.deepEqual(p.carveBlend,baseline.carveBlend);
    assert.deepEqual(makeTemplate(p,'Meares 1').contact,makeTemplate(baseline,'Meares 1').contact);
    near(p.sideY,baseline.sideY);near(p.bottom,baseline.bottom);
    for(let i=0;i<=200;i++){
      const x=p.joinX*i/200;
      assert.deepEqual(surface(x,p.params),surface(x,baseline.params));
    }
  }
});

test('rounding moves the superellipse underside, because shaping stops just below the file',()=>{
  const baseline=generate({...DEFAULTS,blend:0});
  near(baseline.flatSideHeight,SHAPING_MARGIN);
  let previous=baseline.sideY;
  for(const blend of [.25,.5,1,1.5]){
    const p=generate({...DEFAULTS,blend});
    const drop=p.edgeY-p.corner.sideTopY;
    // The one rule: stop shaping a fixed hair below wherever the file reaches.
    near(flatSide(p.params),drop+SHAPING_MARGIN);
    near(p.flatSideHeight,SHAPING_MARGIN);
    assert.ok(p.sideY<previous,'more rounding means shaping stops lower');
    previous=p.sideY;
    // The crown, the width and the centre thickness are still untouched by it.
    near(p.bottom,baseline.bottom);near(p.top,baseline.top);
    for(let i=0;i<=200;i++){
      const x=p.joinX*i/200;
      assert.deepEqual(surface(x,p.params),surface(x,baseline.params));
    }
  }
});

test('zero rounding retains the sharp arc-to-flat-side corner',()=>{
  for(const [params,flat] of [[DEFAULTS,SHAPING_MARGIN],
                              [{...DEFAULTS,model:'quartic'},FLAT_SIDE_FRACTION*DEFAULTS.thickness]]){
    const p=generate({...params,blend:0});
    near(p.joinX,DEFAULTS.width/2);
    assert.ok(p.points.some(([x,y])=>x===DEFAULTS.width/2 && y===p.edgeY));
    near(p.flatSideHeight,flat);
    assert.deepEqual(cornerPoint(p.corner,0),[DEFAULTS.width/2,p.edgeY]);
  }
});

test('rounding removes wood only, preserving width and centre thickness',()=>{
  let count=0;
  for(const width of [40,60,80])for(const radius of [45,70,110])
    for(const thickness of [18,26,34])for(const blend of [0,.5,1]){
      const params={width,radius,thickness,blend};if(!validate(params).valid)continue;count++;
      const p=generate(params),xs=p.points.map(v=>v[0]),ys=p.points.map(v=>v[1]);
      near(Math.max(...xs)-Math.min(...xs),width);
      near(Math.max(...ys),0);near(Math.min(...ys),-thickness);
      near(1/curvature(surface(0,params)),radius);
      for(const [x,y]of p.points){
        assert.ok(Math.abs(x)<=width/2+1e-9);
        assert.ok(y<=surface(x,params).y+1e-8,'no wood added above original playing arc');
        assert.ok(y>=-thickness-1e-8);
      }
      assert.ok(p.flatSideHeight>0);
    }
  assert.ok(count>20,`only ${count} valid combinations`);
});

test('small finish is tangent to the playing circle and vertical side',()=>{
  for(const params of [DEFAULTS,...Object.values(PRESETS)]){
    const p=generate(params),c=p.corner,start=cornerPoint(c,0),end=cornerPoint(c,1);
    near(start[1],surface(start[0],params).y);
    near(-Math.cos(c.angle)/Math.sin(c.angle),surface(start[0],params).first);
    near(end[0],params.width/2);near(end[1],c.sideTopY);
    near(cornerPoint(c,1)[1]-p.sideY,p.flatSideHeight);
    for(let i=0;i<=100;i++){
      const [x,y]=cornerPoint(c,i/100);near(Math.hypot(x-c.center[0],y-c.center[1]),params.blend);
    }
    assert.ok(p.joinX > .9*params.width/2, 'corner trim retains the central playing arc');
  }
});

test('Meares 1 lowered corners keep the crown and centre, and leave the same hair of flat',()=>{
  const before=generate({...PRESETS.meares1,blend:.5}),after=generate(PRESETS.meares1);
  near(after.bottom,before.bottom);
  assert.ok(before.corner.sideTopY-after.corner.sideTopY>2,'the 4 mm fillet drops the corner much further');
  // Both stop shaping the same hair below the file, so both leave 0.1 mm of flat
  // while the shaping itself reaches very different heights.
  near(after.flatSideHeight,SHAPING_MARGIN);near(before.flatSideHeight,SHAPING_MARGIN);
  assert.ok(before.sideY-after.sideY>2,'the deeper rounding means shaping stops lower');
  for(let i=0;i<=100;i++){
    const x=after.joinX*i/100;
    assert.deepEqual(surface(x,after.params),surface(x,before.params));
  }
});

test('underside blends into the flat wall with zero curvature and into the quartic with G2 continuity',()=>{
  for(const base of [DEFAULTS,...Object.values(PRESETS)]){
    const params={...base,model:'quartic'};
    const p=generate(params),curve=p.carveBlend,b=surface(p.underJoinX,params,true);
    assert.deepEqual(bezier(curve,0),[params.width/2,p.sideY]);
    near(bezier(curve,0,1)[0],0);near(1/curveRadius(curve,0),0);
    assert.deepEqual(bezier(curve,1),[p.underJoinX,b.y]);
    const d=bezier(curve,1,1);near(d[1]/d[0],b.first);near(1/curveRadius(curve,1),curvature(b));
    for(let i=1;i<=500;i++){
      const [x1,y1]=bezier(curve,i/500,1),[x2,y2]=bezier(curve,i/500,2);
      assert.ok(x1*y2-y1*x2<0);
    }
    for(let i=0;i<2;i++)near(p.points[0][i],p.points.at(-1)[i]);
  }
});

test('impossible dimensions and rounding that removes the flat side are rejected',()=>{
  for(const patch of [{width:0},{radius:NaN},{blend:-1},{thickness:Infinity},{width:1001},{radius:20}]){
    const p={...DEFAULTS,...patch};assert.equal(validate(p).valid,false);assert.throws(()=>generate(p),RangeError);
    const q={...DEFAULTS,model:'quartic',...patch};assert.equal(validate(q).valid,false);
  }
  // A 5 mm fillet used to be impossible because it outran the fixed flat side.
  // Coupled, it simply means the shaping stops lower; only the quartic rejects it.
  assert.equal(validate({...DEFAULTS,model:'quartic',blend:5}).valid,false);
  assert.equal(validate({...DEFAULTS,blend:5}).valid,true);
  // Rounding can no longer eat the flat on the coupled model: the shaping stops
  // below the file by construction. It still can on the fixed-flat quartic.
  const eats=radiusForCornerDrop(FLAT_SIDE_FRACTION*DEFAULTS.thickness,DEFAULTS);
  assert.equal(validate({...DEFAULTS,model:'quartic',blend:eats}).valid,false);
  assert.equal(validate({...DEFAULTS,blend:eats}).valid,true);
  near(generate({...DEFAULTS,blend:eats}).flatSideHeight,SHAPING_MARGIN);
});

test('underside gauge retains Overstand margins and exactly matches its contact geometry',()=>{
  const p=generate(DEFAULTS),t=makeTemplate(p,'Meares 1');
  near(t.width,DEFAULTS.width+10);near(t.height,20+p.sideY-p.bottom);
  t.contact.forEach(([x,y],i)=>{near(x,p.underside[i][0]);near(y-t.height+p.sideY,p.underside[i][1]);});
  near(Math.min(...t.contact.map(p=>p[1])),20);
  for(const hole of t.holes)for(const [x,y]of hole){assert.ok(Math.abs(x)<t.width/2-2);assert.ok(y>2&&y<18);}
});

test('names are not dropped, truncated or exported as live text',()=>{
  const p=generate(DEFAULTS);
  for(const name of ['', '   ', '<script>', '🎻', 'X'.repeat(33), 'W'.repeat(24)])assert.throws(()=>makeTemplate(p,name),RangeError);
  for(const name of ['My viol','Meares 1','ABOD 089','Bass (2)']){
    const t=makeTemplate(p,name),svg=exportTemplateSvg(t);assert.equal(t.name,name);
    assert.match(svg,/fill-rule="evenodd"/);assert.match(svg,/fill="black" stroke="none"/);
    assert.doesNotMatch(svg,/<text|<script|font-family/);assert.ok(svg.includes(name));
  }
});

test('every glyph has geometry except space',()=>{
  for(const [char,glyph]of Object.entries(STENCIL_FONT)){
    assert.ok(glyph.advance>0);if(char!==' ')assert.ok(glyph.polygons.length>0,char);
    for(const polygon of glyph.polygons)assert.ok(polygon.length>=3);
  }
});

test('SVG coordinates and physical units have a 1:1 scale',()=>{
  for(const svg of [exportSvg(generate(DEFAULTS)),exportTemplateSvg(makeTemplate(generate(DEFAULTS),'Meares 1'))]){
    const width=Number(svg.match(/width="([\d.]+)mm"/)[1]),height=Number(svg.match(/height="([\d.]+)mm"/)[1]);
    const box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);near(width,box[2]);near(height,box[3]);
  }
});


test('corner drop sets the actual vertical lowering, and the shaping follows it',()=>{
  for(const base of [DEFAULTS,...Object.values(PRESETS)]){
    for(const drop of [0,.3,1,2,4]){
      const p=generate({...base,blend:radiusForCornerDrop(drop,base)});
      near(p.edgeY-p.corner.sideTopY,drop);
      near(flatSide(p.params),drop+SHAPING_MARGIN);
      near(p.flatSideHeight,SHAPING_MARGIN);
      near(p.bottom,-base.thickness);
    }
  }
  // The quartic keeps its fixed flat side and its independence from the rounding.
  for(const base of [DEFAULTS,...Object.values(PRESETS)]){
    const quartic={...base,model:'quartic'},original=generate({...quartic,blend:0});
    const wall=FLAT_SIDE_FRACTION*base.thickness;
    for(const drop of [0,wall*.3,wall*.7,wall-.05]){
      const p=generate({...quartic,blend:radiusForCornerDrop(drop,base)});
      assert.deepEqual(p.underside,original.underside);
      near(p.flatSideHeight,wall-drop);
    }
  }
  for(const drop of [-1,NaN,Infinity,100])assert.ok(Number.isNaN(radiusForCornerDrop(drop,DEFAULTS)));
  assert.equal(validate({...DEFAULTS,model:'quartic',
    blend:radiusForCornerDrop(FLAT_SIDE_FRACTION*DEFAULTS.thickness,DEFAULTS)}).valid,false);
});
