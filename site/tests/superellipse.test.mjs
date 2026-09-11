import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULTS, PRESETS, FLAT_SIDE_FRACTION, SUPERELLIPSE_EXPONENT, radiusForCornerDrop,
  surface, superellipsePoint, validate, generate, exportSvg } from '../src/profile.js';
import { makeTemplate } from '../src/template.js';
const near=(a,b,t=1e-8)=>assert.ok(Math.abs(a-b)<t,`${a} != ${b}`);
const curvature=s=>Math.abs(s.second)/(1+s.first*s.first)**1.5;
const SUPER=params=>({...params,model:'superellipse'});
const CASES=[DEFAULTS,...Object.values(PRESETS)].map(SUPER);

test('the shipped quartic stays the default and is untouched by the prototype',()=>{
  for(const params of [DEFAULTS,...Object.values(PRESETS)]){
    assert.equal(params.model,undefined);
    const p=generate(params);
    assert.ok(p.carveBlend,'default keeps the carving Bezier');
    near(p.underJoinX,params.width/2-.12*params.width);
    // The quartic underside is unchanged by the existence of the other model.
    const h=.85*params.thickness+Math.sqrt(params.radius**2-(params.width/2)**2)-params.radius;
    for(const u of [0,.3,.7,1]){
      const x=u*params.width/2;
      near(surface(x,params,true).y,-params.thickness+h*(.85*u*u+.15*u**4));
    }
  }
});

test('one equation replaces the quartic, its carving Bezier and their four constants',()=>{
  for(const params of CASES){
    const p=generate(params);
    assert.equal(p.carveBlend,null,'no carving piece is constructed');
    near(p.underJoinX,params.width/2); // the underside reaches the wall itself
    // Everything but the exponent comes from W, R and T.
    const a=params.width/2, edge=Math.sqrt(params.radius**2-a*a)-params.radius;
    const sideY=edge-FLAT_SIDE_FRACTION*params.thickness, depth=sideY+params.thickness;
    for(const u of [0,.25,.5,.75,1]){
      const n=SUPERELLIPSE_EXPONENT, x=u*a;
      near(surface(x,params,true).y,sideY-depth*(1-u**n)**(1/n));
    }
  }
});

test('superellipse sections keep exact width, crown and maximum thickness',()=>{
  let count=0;
  for(const width of [40,60,80])for(const radius of [45,70,110])
    for(const thickness of [18,26,34])for(const blend of [0,.5,1]){
      const params=SUPER({width,radius,thickness,blend});
      if(!validate(params).valid)continue;count++;
      const p=generate(params),xs=p.points.map(v=>v[0]),ys=p.points.map(v=>v[1]);
      near(Math.max(...xs)-Math.min(...xs),width);
      near(Math.max(...ys),0);near(Math.min(...ys),-thickness);
      near(1/curvature(surface(0,params)),radius,1e-7);
      for(const [x,y]of p.points){
        assert.ok(Math.abs(x)<=width/2+1e-9);
        assert.ok(y<=surface(x,params).y+1e-8,'no wood added above the playing arc');
        assert.ok(y>=-thickness-1e-8);
      }
      assert.ok(p.flatSideHeight>0);
    }
  assert.ok(count>20,`only ${count} valid combinations`);
});

test('the underside meets the wall exactly, with a vertical tangent no polynomial can give',()=>{
  for(const params of CASES){
    const p=generate(params),a=params.width/2;
    assert.deepEqual(superellipsePoint(params,0),[a,p.sideY]);
    near(superellipsePoint(params,1)[0],0);
    near(superellipsePoint(params,1)[1],-params.thickness);
    // Slope must diverge towards the wall rather than settle at a finite value.
    let previous=0;
    for(const t of [.05,.01,.002,.0004]){
      const [x0,y0]=superellipsePoint(params,0),[x1,y1]=superellipsePoint(params,t);
      const slope=Math.abs((y1-y0)/(x1-x0));
      assert.ok(slope>previous*2.5,`slope ${slope} must keep growing`);
      previous=slope;
    }
    assert.ok(previous>100,'tangent is effectively vertical at the wall');
  }
});

test('the underside is convex and descends monotonically from wall to centre',()=>{
  for(const params of CASES){
    const right=generate(params).underside.filter(([x])=>x>=-1e-12);
    for(let i=1;i<right.length;i++){
      assert.ok(right[i][0]<=right[i-1][0]+1e-12,'x moves inward');
      assert.ok(right[i][1]<=right[i-1][1]+1e-12,'y descends');
    }
    for(let i=2;i<right.length;i++){
      const [ax,ay]=right[i-2],[bx,by]=right[i-1],[cx,cy]=right[i];
      assert.ok((bx-ax)*(cy-by)-(by-ay)*(cx-bx)<=1e-12,'convex, with no inflection');
    }
  }
});

test('corner drop still leaves the whole superellipse underside untouched',()=>{
  for(const base of CASES){
    const original=generate({...base,blend:0});
    for(const drop of [0,.3,1,2,FLAT_SIDE_FRACTION*base.thickness-.05]){
      const p=generate({...base,blend:radiusForCornerDrop(drop,base)});
      near(p.edgeY-p.corner.sideTopY,drop);
      assert.deepEqual(p.underside,original.underside);
      assert.deepEqual(makeTemplate(p,'Meares 1').contact,makeTemplate(original,'Meares 1').contact);
      near(p.flatSideHeight,FLAT_SIDE_FRACTION*base.thickness-drop);
    }
  }
});

test('curvature is unbounded at the centre and at the wall, unlike the quartic',()=>{
  // Recorded as a known cost of n < 2, not an incidental detail: the quartic
  // holds a finite centre radius and the carving Bezier meets the wall at zero
  // curvature (G2). The superellipse gives up both for its single equation.
  const params=SUPER(DEFAULTS),a=params.width/2;
  let centre=Infinity;
  for(const x of [3,.6,.06,.006]){
    const radius=1/curvature(surface(x,params,true));
    assert.ok(radius<centre,'radius keeps shrinking towards the centre');
    centre=radius;
  }
  assert.ok(centre<5,'centre curvature radius collapses');
  let wall=Infinity;
  for(const x of [a-1,a-.1,a-.01]){
    const radius=1/curvature(surface(x,params,true));
    assert.ok(radius<wall,'radius keeps shrinking towards the wall');
    wall=radius;
  }
  assert.ok(wall<5,'wall curvature radius collapses');
  // The quartic, for contrast, stays finite and near constant across the span.
  const quartic=[.006,3,9].map(x=>1/curvature(surface(x,DEFAULTS,true)));
  for(const radius of quartic)assert.ok(radius>20&&radius<60,`${radius} stays moderate`);
});

test('the model choice is validated and the two models differ only below the crown',()=>{
  for(const patch of [{model:'quintic'},{model:'superellipse',exponent:1},
                      {model:'superellipse',exponent:0},{model:'superellipse',exponent:NaN}]){
    const params={...DEFAULTS,...patch};
    assert.equal(validate(params).valid,false);
    assert.throws(()=>generate(params),RangeError);
  }
  assert.ok(validate(SUPER(DEFAULTS)).message.includes('Superellipse'));
  const q=generate(DEFAULTS),s=generate(SUPER(DEFAULTS));
  near(q.edgeY,s.edgeY);near(q.sideY,s.sideY);near(q.bottom,s.bottom);
  assert.deepEqual(q.corner,s.corner);
  for(let i=0;i<=100;i++){
    const x=q.joinX*i/100;
    assert.deepEqual(surface(x,DEFAULTS),surface(x,SUPER(DEFAULTS)),'playing arc is shared');
  }
  assert.notDeepEqual(q.underside,s.underside);
});

test('exponent and flat side are dials, and a thinner wall limits the corner drop',()=>{
  const base=SUPER(DEFAULTS);
  // Defaults are a drop-in swap: same wall as the quartic, same available drop.
  near(generate({...base,blend:0}).flatSideHeight,FLAT_SIDE_FRACTION*DEFAULTS.thickness);
  near(generate({...DEFAULTS,blend:0}).flatSideHeight,FLAT_SIDE_FRACTION*DEFAULTS.thickness);
  // Both ends are pinned at -T and the wall, so the exponent only moves the
  // span between them: a squarer curve stays deep further out, removing more
  // wood, and then turns up harder into the wall.
  const round=generate({...base,exponent:1.4}).underside,square=generate({...base,exponent:2.4}).underside;
  const at=(pts,x)=>pts.filter(([px])=>px>=0).reduce((a,b)=>Math.abs(b[0]-x)<Math.abs(a[0]-x)?b:a)[1];
  for(const x of [6,12,18,24])assert.ok(at(square,x)<at(round,x),`n=2.4 sits deeper at x=${x}`);
  for(const pts of [round,square]){
    near(Math.min(...pts.map(v=>v[1])),-DEFAULTS.thickness);
    near(Math.max(...pts.map(v=>v[1])),generate({...base,blend:0}).sideY);
  }
  // The trace-optimal setting is reachable, and its thin wall is what limits drop.
  const thin={...base,exponent:1.74,sideFraction:.019,blend:0};
  assert.equal(validate(thin).valid,true);
  near(generate(thin).flatSideHeight,.019*DEFAULTS.thickness);
  assert.ok(generate(thin).flatSideHeight<.6,'about half a millimetre of wall');
  assert.equal(validate({...thin,blend:radiusForCornerDrop(1,DEFAULTS)}).valid,false);
  assert.equal(validate({...base,blend:radiusForCornerDrop(1,DEFAULTS)}).valid,true);
  for(const patch of [{sideFraction:-.1},{sideFraction:NaN}])
    assert.equal(validate({...base,...patch}).valid,false);
});

test('templates and outlines export from a superellipse section unchanged in kind',()=>{
  for(const params of CASES){
    const p=generate(params),t=makeTemplate(p,'Meares 1');
    near(t.width,params.width+10);near(t.height,20+p.sideY-p.bottom);
    t.contact.forEach(([x,y],i)=>{near(x,p.underside[i][0]);near(y-t.height+p.sideY,p.underside[i][1]);});
    near(Math.min(...t.contact.map(v=>v[1])),20);
    const svg=exportSvg(p);
    const width=Number(svg.match(/width="([\d.]+)mm"/)[1]),box=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);
    near(width,box[2]);
  }
});
