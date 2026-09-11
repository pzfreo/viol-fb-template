import { STENCIL_FONT } from './stencil-font.js';

export function makeTemplate(profile, name = 'My viol') {
  const label = name.trim();
  if (!label) throw new RangeError('Add a name for the stencil.');
  if (label.length > 32) throw new RangeError('Use a shorter name (up to 32 characters).');
  for (const char of label)
    if (!Object.hasOwn(STENCIL_FONT, char)) throw new RangeError('Use letters A–Z, numbers, spaces, or . - ( ) in the stencil name.');
  const plateWidth = profile.params.width + 10; // Overstand's 5 mm side margins.
  const available = plateWidth - 8;
  const advance = [...label].reduce((sum, char) => sum + STENCIL_FONT[char].advance + .07, 0) - .07;
  const capHeight = Math.min(6, available / advance);
  if (capHeight < 4.5) throw new RangeError('This name is too long for a sturdy stencil at this width. Shorten the name or increase the fingerboard width.');
  const depth = profile.sideY - profile.bottom;
  const cornerDrop = profile.edgeY - profile.corner.sideTopY;
  const base = depth + 20;
  const contact = profile.underside.map(([x,y]) => [x, base + y - profile.sideY]);
  const outer = [[-plateWidth/2, 0], [plateWidth/2, 0], [plateWidth/2, base], ...contact, [-plateWidth/2, base]];
  let cursor = -advance * capHeight / 2;
  const baseline = 10 + capHeight / 2;
  const holes = [];
  for (const char of label) {
    const glyph = STENCIL_FONT[char];
    for (const polygon of glyph.polygons)
      holes.push(polygon.map(([x, y]) => [cursor + x * capHeight, baseline + y * capHeight]));
    cursor += (glyph.advance + .07) * capHeight;
  }
  return { outer, holes, width: plateWidth, height: base, name: label,
    capHeight, contact, cornerDrop, flatSide: profile.edgeY - profile.sideY,
    parameters: profile.params };
}

export function polygonPath(points) {
  return points.map(([x,y],i) => `${i ? 'L' : 'M'} ${x.toFixed(6)} ${y.toFixed(6)}`).join(' ') + ' Z';
}
function xmlEscape(value) {
  return value.replace(/[<>&"']/g, char => ({ '<':'&lt;', '>':'&gt;', '&':'&amp;', '"':'&quot;', "'":'&apos;' })[char]);
}
export function exportTemplateSvg(template) {
  const margin = 2;
  const path = [template.outer,...template.holes].map(polygonPath).join(' ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${template.width+2*margin}mm" height="${template.height+2*margin}mm" viewBox="${-template.width/2-margin} ${-margin} ${template.width+2*margin} ${template.height+2*margin}">\n<title>${xmlEscape(template.name)} — underside template</title>\n<desc>Millimetres. Solid plate with a matching underside edge and through-cut stencil lettering. Import as a filled shape and extrude, for example to 3 mm. Body extends 20 mm beyond deepest contact point. Allerta Stencil letter cutouts with the font's original counter bridges. Side shoulders are 5 mm wide. W=${template.parameters.width}; R=${template.parameters.radius}; T=${template.parameters.thickness}; B=${template.parameters.blend}. Corner rounding drops the edge ${template.cornerDrop.toFixed(2)} mm and leaves a ${template.flatSide.toFixed(2)} mm flat side; the contact edge below follows that rounding, so this template matches only that amount. This SVG is a 2D extrusion profile, not an STL.</desc>\n<path fill="black" stroke="none" fill-rule="evenodd" d="${path}"/>\n</svg>\n`;
}
