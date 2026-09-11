/** Fixed playing arc; one superellipse underside rising to the flat sides left
 * on the blank; top corners eased last with a file.
 * All lengths are millimetres. Crown is (0, 0); underside centre is (0, -T).
 */
export const DEFAULTS = Object.freeze({ width: 60, radius: 70, thickness: 26, blend: .5 });
// Flat sides are sized to each drawing's corner drop plus a hair, since the
// wall is only what the file needs, not a design proportion. See PRESETS notes
// in analysis/README.md.
export const PRESETS = Object.freeze({
  meares1: { width: 60, radius: 70.25, thickness: 26.87, blend: 4, sideFraction: .1 },
  meares2: { width: 60, radius: 69.38, thickness: 25.55, blend: .5, sideFraction: .0164 },
});
/** The vertical wall left on the blank. The board starts as a rectangular
 * section: the underside is worked down to the template until it rises to meet
 * the original flat face, and whatever flat is left is then softened with a
 * file. So this is leftover stock sized to what the file needs, not a design
 * proportion -- it only has to outlast the corner drop. 0.1 is a safe default
 * for a fresh design; the traces prefer far less (meares2 wants 0.0164).
 */
export const FLAT_SIDE_FRACTION = .1;
/** Underside model. 'superellipse' is the default: one equation,
 * (x/a)^n + (y/b)^n = 1, spanning the whole underside from the centre to the
 * wall, which it reaches with a vertical tangent -- matching how the board is
 * actually worked, and something no y = f(x) polynomial can do. Only the
 * exponent is chosen; a, b and the wall height follow from W, R, T and the
 * flat side left on the blank.
 *
 * 'quartic' is the earlier construction, kept for comparison: a quartic in x
 * over the central span plus a G2 quintic Bezier carving up into the wall,
 * needing six chosen constants where this needs one.
 *
 * 1.69 is the joint least-squares fit to both Meares traces with each flat side
 * sized to its corner drop (pooled 2.31 px against the quartic's 3.22 px); see
 * analysis/superellipse-fit.json. It is a tuning dial, not a derived value.
 */
export const UNDERSIDE_MODELS = Object.freeze(['quartic','superellipse']);
export const SUPERELLIPSE_EXPONENT = 1.69;
export const SUPERELLIPSE_SIDE_FRACTION = FLAT_SIDE_FRACTION;
const modelOf = params => params.model ?? 'superellipse';
const exponentOf = params => params.exponent ?? SUPERELLIPSE_EXPONENT;
const sideFractionOf = params => modelOf(params)==='superellipse'
  ? params.sideFraction ?? SUPERELLIPSE_SIDE_FRACTION : FLAT_SIDE_FRACTION;

// Half-depth of the superellipse: it spans from the underside centre at -T up
// to the foot of the wall, which it meets with a vertical tangent.
function superellipse(params) {
  const a=params.width/2;
  const sideY=surface(a,params).y-sideFractionOf(params)*params.thickness;
  return {a,sideY,depth:sideY+params.thickness,n:exponentOf(params)};
}
/** Right half of the superellipse, parametrised from the wall (t=0) to the
 * centre (t=1). Parametric sampling reaches the vertical tangent exactly; the
 * y = f(x) form cannot, because its slope diverges there.
 */
export function superellipsePoint(params,t) {
  const {a,sideY,depth,n}=superellipse(params), angle=t*Math.PI/2;
  return [a*Math.cos(angle)**(2/n), sideY-depth*Math.sin(angle)**(2/n)];
}
const add = (a,b) => a.map((v,i)=>v+b[i]);
const mul = (p,k) => p.map(v=>v*k);
const cross = (a,b) => a[0]*b[1]-a[1]*b[0];

// Invert the tangent corner construction: drop is measured vertically down
// from the original playing-arc/side intersection to the fillet's side end.
export function radiusForCornerDrop(drop, params) {
  const a=params.width/2, r=params.radius, root=Math.sqrt(r*r-a*a);
  if(!Number.isFinite(drop)||drop<0||drop>root||r<=a)return NaN;
  return drop*(2*root-drop)/(2*(r-a));
}

export function surface(x, params, underside = false) {
  const a = params.width / 2;
  if (!underside) {
    const root = Math.sqrt(params.radius ** 2 - x ** 2);
    return { y: root - params.radius, first: -x/root, second: -(params.radius**2)/root**3 };
  }
  // These coefficients depend on W, R and T only. Blend NEVER enters this curve.
  if (modelOf(params) === 'superellipse') {
    const {sideY,depth,n}=superellipse(params), u=Math.abs(x)/a, s=1-u**n;
    // d/du (1-u^n)^(1/n) = -u^(n-1) (1-u^n)^(1/n-1); the sign follows x.
    return { y: sideY-depth*s**(1/n),
      first: Math.sign(x)*depth*u**(n-1)*s**(1/n-1)/a,
      second: depth*(n-1)*(u**(n-2)*s**(1/n-1)+u**(2*n-2)*s**(1/n-2))/(a*a) };
  }
  const h = .85 * params.thickness + Math.sqrt(params.radius**2-a*a) - params.radius;
  const u = x/a;
  return { y: -params.thickness + h*(.85*u*u+.15*u**4),
    first: h*(1.7*u+.6*u**3)/a, second: h*(1.7+1.8*u*u)/(a*a) };
}

export function bezier(control, t, derivative = 0) {
  let p = control.map(v=>[...v]);
  for (let k=0;k<derivative;k++) p=p.slice(1).map((v,i)=>mul(add(v,mul(p[i],-1)),p.length-1));
  while(p.length>1) p=p.slice(1).map((v,i)=>add(mul(p[i],1-t),mul(v,t)));
  return p[0];
}
export function curveRadius(control,t) {
  const d1=bezier(control,t,1), d2=bezier(control,t,2);
  return Math.hypot(...d1)**3/Math.abs(cross(d1,d2));
}
function hermite(p0,p5,d0,d5,dd0,dd5) {
  const p1=add(p0,mul(d0,1/5)), p2=add(add(mul(p1,2),mul(p0,-1)),mul(dd0,1/20));
  const p4=add(p5,mul(d5,-1/5)), p3=add(add(mul(p4,2),mul(p5,-1)),mul(dd5,1/20));
  return [p0,p1,p2,p3,p4,p5];
}
export function construction(params) {
  const {width,radius,thickness,blend}=params;
  const a=width/2;
  const edgeY=surface(a,params).y;
  // What is left of the blank's flat face once the underside is worked to the
  // template. Independent of corner easing, which is filed from it afterwards.
  const sideY=edgeY-sideFractionOf(params)*thickness;
  // The superellipse already arrives at the wall vertically, so it needs no
  // carving piece and joins at the full half width instead of short of it.
  const superellipseModel=modelOf(params)==='superellipse';
  const span=.12*width, underJoinX=superellipseModel?a:a-span;
  const bottom=superellipseModel?null:surface(underJoinX,params,true);
  const length=1.2*span, vertical=superellipseModel?null:.7*(sideY-bottom.y);
  // Carve from the underside up to the vertical side. Zero curvature at the
  // side end gives a smooth meeting with the straight wall.
  const carveBlend=superellipseModel?null
    :hermite([a,sideY],[underJoinX,bottom.y],[0,-vertical],
    [-length,-length*bottom.first],[0,0],[0,bottom.second*length*length]);
  let corner={radius:0,center:[a,edgeY],angle:0,joinX:a,sideTopY:edgeY};
  if(blend>0){
    const cx=a-blend;
    const cy=-radius+Math.sqrt((radius-blend)**2-cx*cx);
    const angle=Math.atan2(cy+radius,cx);
    corner={radius:blend,center:[cx,cy],angle,
      joinX:radius*cx/(radius-blend),sideTopY:cy};
  }
  return {edgeY,sideY,underJoinX,carveBlend,vertical,corner,
    flatSideHeight:corner.sideTopY-sideY};
}
export function cornerPoint(corner,t) {
  const angle=corner.angle*(1-t);
  return [corner.center[0]+corner.radius*Math.cos(angle),
    corner.center[1]+corner.radius*Math.sin(angle)];
}
const binomial = (n,k) => {
  let c=1; for(let i=1;i<=k;i++)c=c*(n-i+1)/i; return c;
};
function nonpositive(coefficients,depth=0) {
  if(Math.max(...coefficients)<=1e-12)return true;
  if(Math.min(...coefficients)>1e-12 || depth>=14)return false;
  // The polynomial lies in the convex hull of its Bernstein coefficients.
  let row=[...coefficients]; const left=[row[0]],right=[row.at(-1)];
  while(row.length>1){row=row.slice(1).map((v,i)=>(v+row[i])/2);left.push(row[0]);right.push(row.at(-1));}
  return nonpositive(left,depth+1)&&nonpositive(right.reverse(),depth+1);
}
function convexBlend(control) {
  const d1=control.slice(1).map((p,i)=>mul(add(p,mul(control[i],-1)),5));
  const d2=d1.slice(1).map((p,i)=>mul(add(p,mul(d1[i],-1)),4));
  const n=Array(8).fill(0);
  for(let i=0;i<5;i++)for(let j=0;j<4;j++)
    n[i+j]+=binomial(4,i)*binomial(3,j)/binomial(7,i+j)*cross(d1[i],d2[j]);
  return nonpositive(n);
}

export function validate(params) {
  for(const key of ['width','radius','thickness','blend'])
    if(!Number.isFinite(params[key])||params[key]>(key==='blend'?100:1000)||
      (key==='blend'?params[key]<0:params[key]<=0))
      return {valid:false,message:'Enter positive width, radius and thickness. Corner drop must be nonnegative; zero leaves a sharp edge.'};
  if(params.radius<=params.width/2)
    return {valid:false,message:'The playing-surface radius must be greater than half the fingerboard width.'};
  if(params.blend>=params.width/2)
    return {valid:false,message:'Reduce corner drop to fit the top edge.'};
  if(!UNDERSIDE_MODELS.includes(modelOf(params)))
    return {valid:false,message:'Choose a supported underside model.'};
  if(modelOf(params)==='superellipse'){
    // Convexity needs no checking here: a superellipse is convex for every n>1.
    if(!(exponentOf(params)>1)||!Number.isFinite(exponentOf(params)))
      return {valid:false,message:'The superellipse exponent must be greater than 1.'};
    if(!(sideFractionOf(params)>=0)||!Number.isFinite(sideFractionOf(params)))
      return {valid:false,message:'The flat-side fraction must be zero or more.'};
    const geometry=construction(params);
    if(!(superellipse(params).depth>0))
      return {valid:false,message:'Increase thickness or crown radius to leave depth below the flat sides.'};
    if(geometry.flatSideHeight<=1e-8)
      return {valid:false,message:'This drop removes the whole flat side. Use a smaller corner drop.'};
    return {valid:true,message:params.blend===0?'Superellipse underside · sharp top corners':'Superellipse underside · lightly rounded top corners',geometry};
  }
  const under=surface(0,params,true);
  if(under.second<=1/params.radius)
    return {valid:false,message:'Increase thickness or crown radius to give the underside a stronger curve than the playing surface.'};
  const geometry=construction(params);
  if(geometry.vertical<=0 || !convexBlend(geometry.carveBlend))
    return {valid:false,message:'These dimensions do not leave room to carve a smooth underside up to the flat sides.'};
  if(geometry.flatSideHeight<=1e-8)
    return {valid:false,message:'This drop removes the whole flat side. Use a smaller corner drop.'};
  return {valid:true,message:params.blend===0?'Carved underside · sharp top corners':'Carved underside · lightly rounded top corners',geometry};
}

export function generate(params,samples=1200) {
  const result=validate(params);
  if(!result.valid)throw new RangeError(result.message);
  if(!Number.isInteger(samples)||samples<16||samples>100000)throw new RangeError('Use an integer sample count between 16 and 100,000.');
  const {sideY,underJoinX,carveBlend,corner}=result.geometry;
  const count=Math.max(8,Math.ceil(samples/8));
  const topCore=Array.from({length:count+1},(_,i)=>{
    const x=corner.joinX*i/count;return [x,surface(x,params).y];
  });
  const cornerPoints=corner.radius>0?Array.from({length:Math.max(16,Math.ceil(count/4))},(_,i)=>
    cornerPoint(corner,(i+1)/Math.max(16,Math.ceil(count/4)))):[];
  // One equation replaces the carving piece and the quartic core alike, so the
  // superellipse contributes a single run of points from the wall to the centre.
  const lower=modelOf(params)==='superellipse'
    ? Array.from({length:2*count},(_,i)=>superellipsePoint(params,(i+1)/(2*count)))
    : [...Array.from({length:count},(_,i)=>bezier(carveBlend,(i+1)/count)),
       ...Array.from({length:count},(_,i)=>{
         const x=underJoinX*(1-(i+1)/count);return [x,surface(x,params,true).y];
       })];
  const sideBottom=[params.width/2,sideY];
  const right=[...topCore,...cornerPoints,sideBottom,...lower];
  const points=[...right,...right.slice(0,-1).reverse().map(([x,y])=>[-x,y])];
  const lowerRight=[sideBottom,...lower];
  const underside=[...lowerRight,...lowerRight.slice(0,-1).reverse().map(([x,y])=>[-x,y])];
  return {params:{...params},points,underside,top:0,bottom:-params.thickness,
    ...result.geometry,joinX:corner.joinX,cornerMidpoint:cornerPoint(corner,.5)};
}

export function exportSvg(profile) {
  const {width,thickness,radius,blend}=profile.params;
  const margin=5;
  const path=profile.points.map(([x,y],i)=>`${i?'L':'M'}${x.toFixed(6)} ${(-y).toFixed(6)}`).join(' ')+' Z';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width+2*margin}mm" height="${thickness+2*margin}mm" viewBox="${-width/2-margin} ${-margin} ${width+2*margin} ${thickness+2*margin}">\n<title>Viol fingerboard: W ${width}, R ${radius}, T ${thickness}, B ${blend} mm</title>\n<desc>1:1 outline in millimetres. Fixed circular playing surface and flat side walls; quartic underside carved up into the sides. B is only the small top-corner rounding radius; zero leaves a sharp corner. Print at 100 percent.</desc>\n<path d="${path}" fill="none" stroke="black" stroke-width="0.15"/>\n</svg>\n`;
}
