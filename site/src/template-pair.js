import { fingerboardSections } from './fingerboard.js';
import { construction, radiusForCornerDrop, generate } from './profile.js';
import { makeTemplate, polygonPath } from './template.js';

export function makeTemplatePair(dimensions, shared, name) {
  if(!name.trim())throw new RangeError('Add a shared stencil name.');
  const geometry=construction(shared);
  const dropRatio=(geometry.edgeY-geometry.corner.sideTopY)/shared.thickness;
  const sections=fingerboardSections(dimensions).map(section=>{
    try {
      if(!section.onBoard)throw new RangeError('This fret is beyond the fingerboard end.');
      const thickness=dimensions[`thickness${section.fret}`];
      if(!Number.isFinite(thickness)||thickness<=0)throw new RangeError('Enter a positive maximum thickness.');
      const params={width:section.width,radius:dimensions.topRadius??shared.radius*section.width/shared.width,thickness};
      params.blend=radiusForCornerDrop(dropRatio*thickness,params);
      const profile=generate(params);
      return {...section,profile,template:makeTemplate(profile,`${name.trim()} F${section.fret}`)};
    } catch(error) {throw new RangeError(`Fret ${section.fret}: ${error.message}`);}
  });
  const margin=2,gap=10;
  let left=margin;
  for(const section of sections){
    section.offset=[left+section.template.width/2,margin];
    left+=section.template.width+gap;
  }
  return {sections,width:left-gap+margin,height:Math.max(...sections.map(s=>s.template.height))+2*margin};
}

export function exportTemplatePairSvg(pair) {
  const paths=pair.sections.map(({template,offset})=>{
    const outlines=[template.outer,...template.holes].map(polygon=>polygon.map(([x,y])=>[x+offset[0],y+offset[1]]));
    return `<path fill="black" fill-rule="evenodd" stroke="none" d="${outlines.map(polygonPath).join(' ')}"/>`;
  }).join('\n');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pair.width}mm" height="${pair.height}mm" viewBox="0 0 ${pair.width} ${pair.height}">\n<title>Fret 1 and fret 7 underside templates</title>\n<desc>Two separate stencil plates at 1:1 millimetre scale, spaced 10 mm apart. Labels identify F1 and F7. Import as filled profiles and extrude to the required printing thickness.</desc>\n${paths}\n</svg>\n`;
}
