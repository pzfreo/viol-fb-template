import { DEFAULTS, PRESETS, validate, generate, exportSvg, construction, radiusForCornerDrop } from './profile.js';
import { REFERENCES } from './references.js';
import { makeTemplate, exportTemplateSvg } from './template.js';
import { fingerboardSections } from './fingerboard.js';
import { makeTemplatePair, exportTemplatePairSvg } from './template-pair.js';

const $ = id => document.getElementById(id);
const fields = [
  { key: 'width', title: 'Fingerboard width', symbol: 'W', min: 30, max: 100, step: .1, hint: 'The full distance from side to side.' },
  { key: 'radius', title: 'Crown radius', symbol: 'R', min: 30, max: 160, step: .1, hint: 'A larger radius makes the centre flatter.' },
  { key: 'thickness', title: 'Maximum thickness', symbol: 'T', min: 10, max: 45, step: .1, hint: 'The depth through the centre of the board.' },
  { key: 'cornerDrop', title: 'Corner drop', symbol: 'D', min: 0, max: 4, step: .05, hint: 'Vertical lowering from the original top corner. Zero leaves it sharp; the underside stays fixed.' },
];
let params = { ...DEFAULTS };
let lastValid = generate(params);
let cornerDrop = lastValid.edgeY-lastValid.corner.sideTopY;
let selectedPreset = 'custom';
let currentTemplate = null;
let currentPair = null;
let pairPreviewUrl = null;
let profileValid = true;
let drawFrame = 0;
const values = {};
function fieldValue(key, profile = null) {
  if(key !== 'cornerDrop')return (profile?.params || params)[key];
  return profile ? profile.edgeY-profile.corner.sideTopY : cornerDrop;
}

for (const field of fields) {
  const section = document.createElement('div');
  section.className = 'parameter';
  // All interpolated strings here are fixed product labels, never user input.
  section.innerHTML = `<div class="parameter-heading"><label for="${field.key}-number"><span class="parameter-symbol">${field.symbol}</span>${field.title}</label><div class="number-wrap"><input id="${field.key}-number" type="number" min="${field.key === 'cornerDrop' ? 0 : 0.01}" max="${field.key === 'cornerDrop' ? 100 : 1000}" step="${field.step}" inputmode="decimal" aria-describedby="${field.key}-hint"><span>mm</span></div></div><p id="${field.key}-hint">${field.hint}</p><input id="${field.key}-slider" type="range" min="${field.min}" max="${field.max}" step="${field.step}" aria-label="${field.title} slider"><div class="range-labels"><span>${field.min} mm</span><span>${field.max} mm</span></div>`;
  $('parameter-controls').append(section);
  const number = $(`${field.key}-number`), slider = $(`${field.key}-slider`);
  values[field.key] = { number, slider };
  const change = (event) => {
    const value = event.target.value === '' ? NaN : Number(event.target.value);
    if(field.key === 'cornerDrop')cornerDrop = value;
    else params[field.key] = value;
    // Preserve the user's drop when another dimension changes.
    params.blend = radiusForCornerDrop(cornerDrop,params);
    if (event.target === slider) number.value = slider.value;
    else if (Number.isFinite(value)) slider.value = value;
    selectedPreset = 'custom';
    $('preset').value = 'custom';
    update();
  };
  number.addEventListener('input', change);
  slider.addEventListener('input', change);
}

function syncControls() {
  const geometry=construction(params);
  cornerDrop=geometry.edgeY-geometry.corner.sideTopY;
  for (const { key } of fields) {
    const value=fieldValue(key);
    values[key].number.value = Number(value.toFixed(4));
    values[key].slider.value = value;
  }
}

function updateFingerboard() {
  const body=$('section-results');body.replaceChildren();
  const message=$('fingerboard-message');
  currentPair=null;$('export-pair').disabled=true;$('pair-preview').hidden=true;
  if(pairPreviewUrl){URL.revokeObjectURL(pairPreviewUrl);pairPreviewUrl=null;}
  const keys=['nutWidth','endWidth','boardLength','stringLength','thickness1','thickness7'];
  const dimensions=Object.fromEntries(keys.map(key=>[key,$(key).value===''?NaN:Number($(key).value)]));
  if(keys.every(key=>$(key).value==='')){
    message.textContent='Enter all six measurements to generate the pair.';message.classList.remove('error');return;
  }
  try {
    const sections=fingerboardSections(dimensions);
    for(const section of sections){
      const thickness=dimensions[`thickness${section.fret}`],row=document.createElement('tr');
      for(const text of [`Fret ${section.fret}`,`${section.distance.toFixed(2)} mm`,section.onBoard?`${section.width.toFixed(2)} mm`:'Beyond end',Number.isFinite(thickness)?`${thickness.toFixed(2)} mm`:'Enter thickness']){
        const cell=document.createElement('td');cell.textContent=text;row.append(cell);
      }
      body.append(row);
    }
    if(!profileValid)throw new RangeError('Resolve the shared profile dimensions below to generate the pair.');
    currentPair=makeTemplatePair(dimensions,lastValid.params,$('pair-name').value);
    pairPreviewUrl=URL.createObjectURL(new Blob([exportTemplatePairSvg(currentPair)],{type:'image/svg+xml'}));
    $('pair-image').src=pairPreviewUrl;$('pair-preview').hidden=false;
    $('export-pair').disabled=false;
    message.textContent='Both templates are ready. F1 and F7 identify the fret positions.';message.classList.remove('error');
  } catch(error) {
    message.textContent=error.message;message.classList.add('error');
  }
}
for(const key of ['nutWidth','endWidth','boardLength','stringLength','thickness1','thickness7','pair-name'])$(key).addEventListener('input',updateFingerboard);
$('export-pair').addEventListener('click',()=>{
  if(!currentPair)return;
  const name=$('pair-name').value.trim().replace(/[^A-Za-z0-9.-]+/g,'-').replace(/^-+|-+$/g,'')||'Viol';
  download(exportTemplatePairSvg(currentPair),`${name}-F1-F7-underside-templates.svg`);
});
function scheduleDraw() {
  cancelAnimationFrame(drawFrame);
  drawFrame = requestAnimationFrame(() => { drawProfile(); drawTemplate(); });
}
function update() {
  const result = validate(params);
  profileValid = result.valid;
  if (result.valid) lastValid = generate(params);
  $('validation').textContent = result.message;
  $('validation').classList.toggle('error', !result.valid);
  $('drawing-tag').textContent = result.valid ? selectedPreset === 'custom' ? 'Custom profile' : selectedPreset === 'meares1' ? 'Meares 1 inspired' : 'Meares 2 inspired' : 'Last valid profile';
  $('drawing-tag').classList.toggle('invalid', !result.valid);
  $('export-svg').disabled = !result.valid;
  for (const { key } of fields) {
    const metric = $(`metric-${key}`);
    if(metric){
      metric.replaceChildren(document.createTextNode(fieldValue(key,lastValid).toFixed(2)));
      const unit = document.createElement('small'); unit.textContent = 'mm'; metric.append(unit);
    }
    values[key].number.setAttribute('aria-invalid', String(!result.valid));
  }
  updateTemplate();
  updateFingerboard();
  scheduleDraw();
}
function updateTemplate() {
  try {
    if (!profileValid) throw new RangeError('Resolve the profile dimensions before exporting a template.');
    currentTemplate = makeTemplate(lastValid, $('template-name').value);
    $('template-message').textContent = `${currentTemplate.width.toFixed(1)} × ${currentTemplate.height.toFixed(1)} mm plate · vector stencil lettering`;
    $('template-message').classList.remove('error');
    $('export-template').disabled = false;
  } catch (error) {
    currentTemplate = null;
    $('template-message').textContent = error.message;
    $('template-message').classList.add('error');
    $('export-template').disabled = true;
  }
  scheduleDraw();
}

function canvasContext(id) {
  const canvas = $(id), bounds = canvas.getBoundingClientRect();
  const width = bounds.width, height = bounds.height;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return { ctx, width, height };
}
function tracePath(ctx, points, transform) {
  points.forEach((p, i) => { const [x, y] = transform(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
  ctx.closePath();
}
function drawProfile() {
  const { ctx, width, height } = canvasContext('profile-canvas');
  if (!width || !height) return;
  const p = lastValid;
  const narrow = width < 440;
  const sidePadding = narrow ? 36 : 70;
  const scale = Math.min((width - sidePadding * 2) / p.params.width, (height - 165) / p.params.thickness);
  const cx = width / 2, cy = (height - 60) / 2 + (p.top + p.bottom) * scale / 2;
  const transform = ([x, y]) => [cx + x * scale, cy - y * scale];
  ctx.fillStyle = '#fdfcf9'; ctx.fillRect(0, 0, width, height);
  if ($('grid').checked) {
    let step = 5;
    while (step * scale < 22) step *= 2;
    while (step * scale > 70) step /= 2;
    ctx.strokeStyle = '#efefe7'; ctx.lineWidth = .7;
    ctx.beginPath();
    for (let x = cx % (step * scale); x < width; x += step * scale) { ctx.moveTo(x, 0); ctx.lineTo(x, height); }
    for (let y = cy % (step * scale); y < height; y += step * scale) { ctx.moveTo(0, y); ctx.lineTo(width, y); }
    ctx.stroke();
  }
  ctx.strokeStyle = '#d1d6c9'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(sidePadding / 2, cy); ctx.lineTo(width - sidePadding / 2, cy); ctx.moveTo(cx, 30); ctx.lineTo(cx, height - 72); ctx.stroke(); ctx.setLineDash([]);
  ctx.beginPath(); tracePath(ctx, p.points, transform); ctx.fillStyle = '#a6543512'; ctx.fill(); ctx.strokeStyle = '#a65435'; ctx.lineWidth = 2; ctx.stroke();
  const reference = $('reference').value;
  if (REFERENCES[reference]) {
    const referenceTop = Math.max(...REFERENCES[reference].map(p=>p[1]));
    ctx.beginPath(); tracePath(ctx, REFERENCES[reference].map(([x,y])=>[x*p.params.width,(y-referenceTop)*p.params.width]), transform);
    ctx.strokeStyle = '#748b95'; ctx.lineWidth = 1.6; ctx.setLineDash([5, 4]); ctx.stroke(); ctx.setLineDash([]);
  }
  const [left, zero] = transform([-p.params.width / 2, p.sideY]);
  const [right] = transform([p.params.width / 2, p.sideY]);
  const [, top] = transform([0, p.top]);
  const [, bottom] = transform([0, p.bottom]);
  ctx.font = `${narrow ? 9 : 10}px Arial`; ctx.textAlign = 'center'; ctx.fillStyle = '#71796a';
  ctx.fillText('PLAYING SURFACE', cx, top - 22);
  ctx.font = `italic ${narrow ? 12 : 14}px Georgia`; ctx.fillStyle = '#8d987f';
  ctx.fillText('underside', cx, bottom - 19);
  const dimensionY = bottom + 27;
  ctx.strokeStyle = '#a8af9d'; ctx.lineWidth = .8;
  ctx.beginPath(); ctx.moveTo(left, zero + 10); ctx.lineTo(left, dimensionY + 4); ctx.moveTo(right, zero + 10); ctx.lineTo(right, dimensionY + 4); ctx.moveTo(left, dimensionY); ctx.lineTo(right, dimensionY); ctx.stroke();
  for (const [x, direction] of [[left, 1], [right, -1]]) { ctx.beginPath(); ctx.moveTo(x + 5 * direction, dimensionY - 2); ctx.lineTo(x, dimensionY); ctx.lineTo(x + 5 * direction, dimensionY + 2); ctx.stroke(); }
  ctx.fillStyle = '#fdfcf9'; ctx.fillRect(cx - 30, dimensionY - 7, 60, 14);
  ctx.fillStyle = '#727a6c'; ctx.font = '10px Arial'; ctx.fillText(`${p.params.width.toFixed(1)} mm`, cx, dimensionY + 3);
  // The finish is at the top corner, not where the underside meets the side.
  const [cornerX,cornerY] = transform(p.cornerMidpoint);
  ctx.beginPath(); ctx.arc(cornerX, cornerY, 3, 0, 2 * Math.PI); ctx.fillStyle = '#a65435'; ctx.fill();
  if (!narrow) {
    ctx.beginPath(); ctx.moveTo(cornerX + 7, cornerY); ctx.lineTo(cornerX + 19, cornerY - 15); ctx.stroke();
    ctx.textAlign = 'left'; ctx.fillStyle = '#a65435'; ctx.font = 'italic 12px Georgia'; ctx.fillText(`D ${fieldValue('cornerDrop',p).toFixed(2)}`, cornerX + 8, cornerY - 20);
  }
  $('profile-canvas').setAttribute('aria-label', `${profileValid ? 'Current' : 'Last valid'} profile: width ${p.params.width} mm, crown radius ${p.params.radius} mm, maximum thickness ${p.params.thickness} mm, corner drop ${fieldValue('cornerDrop',p).toFixed(2)} mm.`);
}
function drawTemplate() {
  const { ctx, width, height } = canvasContext('template-canvas');
  if (!currentTemplate) {
    ctx.fillStyle = '#72766d'; ctx.font = '12px Arial'; ctx.textAlign = 'center';
    ctx.fillText('Adjust the dimensions or stencil name to preview.', width / 2, height / 2); return;
  }
  const template = currentTemplate;
  const scale = Math.min((width - 24) / template.width, (height - 42) / template.height);
  const transform = ([x,y]) => [width / 2 + x * scale, (height - template.height * scale) / 2 - 4 + y * scale];
  ctx.beginPath(); tracePath(ctx, template.outer, transform);
  for (const hole of template.holes) tracePath(ctx, hole, transform);
  ctx.fillStyle = '#4f6557'; ctx.fill('evenodd');
  ctx.fillStyle = '#72766d'; ctx.textAlign = 'center'; ctx.font = '9px Arial';
  ctx.fillText('Matching underside edge', width / 2, height - 4);
  $('template-canvas').setAttribute('aria-label', `Underside template named ${template.name}, plate width ${template.width} mm, height ${template.height.toFixed(2)} mm, with stencil lettering cut through.`);
}
function download(text, filename, type = 'image/svg+xml') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  $('download-status').textContent = `${filename} downloaded.`;
}
$('preset').addEventListener('change', () => {
  selectedPreset = $('preset').value;
  params = { ...(PRESETS[selectedPreset] || DEFAULTS) };
  if (PRESETS[selectedPreset]) $('reference').value = selectedPreset;
  syncControls(); updateReference(); update();
});
$('reset').addEventListener('click', () => {
  params = { ...DEFAULTS }; selectedPreset = 'custom'; $('preset').value = 'custom';
  $('reference').value = 'none'; $('grid').checked = true; syncControls(); updateReference(); update();
});
function updateReference() {
  const chosen = $('reference').value;
  $('reference-legend').hidden = chosen === 'none';
  $('view-source').disabled = chosen === 'none';
  scheduleDraw();
}
$('reference').addEventListener('change', updateReference);
$('grid').addEventListener('change', scheduleDraw);
$('template-name').addEventListener('input', updateTemplate);
$('view-source').addEventListener('click', () => {
  const reference = $('reference').value;
  if (!REFERENCES[reference]) return;
  $('source-title').textContent = `${reference === 'meares1' ? 'Meares 1' : 'Meares 2'} · original drawing`;
  $('source-image').src = `./public/${reference}.png`;
  $('source-dialog').showModal();
});
$('close-dialog').addEventListener('click', () => $('source-dialog').close());
$('source-dialog').addEventListener('click', event => { if (event.target === $('source-dialog')) $('source-dialog').close(); });
$('export-svg').addEventListener('click', () => { if (profileValid) download(exportSvg(lastValid), 'viol-fingerboard-outline.svg'); });
$('export-template').addEventListener('click', () => {
  if (!currentTemplate || !profileValid) return;
  const name = currentTemplate.name.replace(/[^A-Za-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'viol';
  download(exportTemplateSvg(currentTemplate), `${name}-underside-template.svg`);
});
const observer = new ResizeObserver(scheduleDraw);
observer.observe($('profile-canvas').parentElement);
observer.observe($('template-canvas').parentElement);
syncControls(); update();
