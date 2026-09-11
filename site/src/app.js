import { DEFAULTS, PRESETS, validate, exportSvg, construction, radiusForCornerDrop } from './profile.js';
import { REFERENCES } from './references.js';
import { fingerboardSections } from './fingerboard.js';
import { makeSectionProfiles, makeTemplatePair, exportTemplatePairSvg } from './template-pair.js';
import { parseOverstandExport } from './overstand.js';
import { exportTemplatePair3mf, validatePrintThickness } from './three-mf.js';

const $ = id => document.getElementById(id);
let params = { ...DEFAULTS };
let selectedPreset = 'custom';
let selectedFret = 1;
let lastValid = null;
let currentSections = [];
let currentPair = null;
let pairPreviewUrl = null;
let profileValid = false;
let drawFrame = 0;
const dimensionKeys=['nutWidth','endWidth','boardLength','stringLength','thickness1','thickness7'];
function fieldValue(key, profile) {
  return key==='cornerDrop'?profile.edgeY-profile.corner.sideTopY:profile.params[key];
}
function readDimensions() {
  const dimensions=Object.fromEntries(dimensionKeys.map(key=>[key,$(key).value===''?NaN:Number($(key).value)]));
  if($('pair-radius').value!=='')dimensions.topRadius=Number($('pair-radius').value);
  return dimensions;
}
function selectedThickness() {return Number($(`thickness${selectedFret}`).value);}
// Millimetres again. The shaping now stops a fixed hair below wherever the file
// reaches, so there is no per-design ceiling for the control to run into.
const CORNER_ROUNDING_MAX = 6;
function syncControls() {
  if(!Number.isFinite(params.blend))return;
  const geometry=construction(params),ratio=(geometry.edgeY-geometry.corner.sideTopY)/params.thickness;
  const thickness=selectedThickness(),value=ratio*thickness;
  if(Number.isFinite(value)){
    $('cornerDrop-number').value=Number(value.toFixed(4));$('cornerDrop-slider').value=value;
  }
}
for(const id of ['cornerDrop-number','cornerDrop-slider'])$(id).addEventListener('input',event=>{
  const thickness=selectedThickness();
  const value=event.target.value===''?NaN:Number(event.target.value);
  params.blend=radiusForCornerDrop(value*params.thickness/thickness,params);
  if(id==='cornerDrop-slider')$('cornerDrop-number').value=value;
  else if(Number.isFinite(value))$('cornerDrop-slider').value=value;
  selectedPreset='custom';$('preset').value='custom';
  update(true);
});
function selectFret(fret) {
  selectedFret=fret;
  for(const n of [1,7]){
    $(`tab-f${n}`).setAttribute('aria-selected',String(n===fret));
    $(`tab-f${n}`).tabIndex=n===fret?0:-1;
  }
  $('section-diagram').setAttribute('aria-labelledby',`tab-f${fret}`);
  update();
}
for(const fret of [1,7]){
  $(`tab-f${fret}`).addEventListener('click',()=>selectFret(fret));
  $(`tab-f${fret}`).addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();const next=event.key==='Home'?1:event.key==='End'?7:fret===1?7:1;
    selectFret(next);$(`tab-f${next}`).focus();
  });
}
$('export-outline').addEventListener('click',()=>{
  if(!lastValid||!profileValid)return;
  download(exportSvg(lastValid),`${downloadName()}-F${selectedFret}-outline.svg`);
});
function downloadName(){return $('pair-name').value.trim().replace(/[^A-Za-z0-9.-]+/g,'-').replace(/^-+|-+$/g,'')||'Viol';}
function updateFingerboard(){update();}
function update(preserveCornerInput=false) {
  const body=$('section-results');body.replaceChildren();
  const message=$('fingerboard-message'),templateMessage=$('template-message');
  currentPair=null;currentSections=[];lastValid=null;profileValid=false;
  $('export-pair').disabled=true;$('export-3mf').disabled=true;$('export-outline').disabled=true;$('pair-preview').hidden=true;
  if(pairPreviewUrl){URL.revokeObjectURL(pairPreviewUrl);pairPreviewUrl=null;}
  const dimensions=readDimensions();
  const empty=dimensionKeys.every(key=>$(key).value==='');
  message.classList.remove('error');templateMessage.classList.remove('error');
  templateMessage.textContent='Review the sections above, then download both templates.';
  let issue='Enter all six measurements to review the sections.';
  try {
    if(empty)throw new RangeError(issue);
    const sections=fingerboardSections(dimensions);
    for(const section of sections){
      const thickness=dimensions[`thickness${section.fret}`],row=document.createElement('tr');
      for(const text of [`Fret ${section.fret}`,`${section.distance.toFixed(2)} mm`,section.onBoard?`${section.width.toFixed(2)} mm`:'Beyond end',Number.isFinite(thickness)?`${thickness.toFixed(2)} mm`:'Enter thickness']){
        const cell=document.createElement('td');cell.textContent=text;row.append(cell);
      }
      body.append(row);
    }
    const validation=validate(params);if(!validation.valid)throw new RangeError(validation.message);
    currentSections=makeSectionProfiles(dimensions,params);
    lastValid=currentSections.find(s=>s.fret===selectedFret).profile;profileValid=true;
    message.textContent='Your sections are ready to review in the F1 and F7 tabs below.';
    issue='Rounding applies to both sections in proportion to their thickness.';
    $('export-outline').disabled=false;
    try {
      currentPair=makeTemplatePair(dimensions,params,$('pair-name').value);
      pairPreviewUrl=URL.createObjectURL(new Blob([exportTemplatePairSvg(currentPair)],{type:'image/svg+xml'}));
      $('pair-image').src=pairPreviewUrl;$('pair-preview').hidden=false;$('export-pair').disabled=false;
      templateMessage.textContent='Both templates are ready. F1 and F7 identify the fret positions.';
    } catch(error){templateMessage.textContent=error.message;templateMessage.classList.add('error');}
  } catch(error) {
    issue=error.message;message.textContent=issue;message.classList.toggle('error',!empty);
  }
  $('validation').textContent=issue;$('validation').classList.toggle('error',!empty&&!profileValid);
  $('drawing-tag').textContent=`F${selectedFret} · ${profileValid?'Section at fret '+selectedFret:'Enter valid measurements'}`;
  $('drawing-tag').classList.toggle('invalid',!empty&&!profileValid);
  $('export-outline').textContent=`Download F${selectedFret} outline SVG`;
  for(const key of ['width','radius','thickness','cornerDrop']){
    const metric=$(`metric-${key}`);metric.replaceChildren(document.createTextNode(lastValid?fieldValue(key,lastValid).toFixed(2):'—'));
    if(lastValid){const unit=document.createElement('small');unit.textContent='mm';metric.append(unit);}
  }
  const thickness=selectedThickness(),hasThickness=Number.isFinite(thickness)&&thickness>0;
  $('cornerDrop-number').disabled=!hasThickness;$('cornerDrop-slider').disabled=!hasThickness;
  $('cornerDrop-number').setAttribute('aria-invalid',String(!empty&&!profileValid));
  $('cornerDrop-slider').max=CORNER_ROUNDING_MAX;
  $('cornerDrop-max').textContent=`${CORNER_ROUNDING_MAX.toFixed(2)} mm`;
  if(!preserveCornerInput)syncControls();
  updatePrintSettings();scheduleDraw();
}
function updatePrintSettings() {
  try {
    validatePrintThickness(Number($('print-thickness').value));
    $('print-thickness').setAttribute('aria-invalid','false');
    $('export-3mf').disabled=!currentPair;
    $('print-message').textContent='3MF: two separate solid plates, ready to open in your slicer. SVG: the same flat outlines. Both include the F1 / F7 stencil names.';
  } catch(error){
    $('print-thickness').setAttribute('aria-invalid','true');$('export-3mf').disabled=true;
    $('print-message').textContent=error.message;
  }
}
$('print-thickness').addEventListener('input',updatePrintSettings);
$('export-3mf').addEventListener('click',()=>{
  if(!currentPair)return;
  try {
    const thickness=Number($('print-thickness').value);
    const data=exportTemplatePair3mf(currentPair,thickness);
    const name=$('pair-name').value.trim().replace(/[^A-Za-z0-9.-]+/g,'-').replace(/^-+|-+$/g,'')||'Viol';
    download(data,`${name}-F1-F7-${thickness}mm.3mf`,'model/3mf');
  } catch(error){$('print-message').textContent=error.message;}
});
for(const key of ['nutWidth','endWidth','boardLength','stringLength','thickness1','thickness7','pair-name','pair-radius'])$(key).addEventListener('input',updateFingerboard);
let importSequence=0;
$('overstand-file').addEventListener('change',async()=>{
  const sequence=++importSequence,file=$('overstand-file').files[0];
  if(!file)return;
  try {
    if(file.size>1024*1024)throw new RangeError('Choose a parameter export smaller than 1 MB.');
    const imported=parseOverstandExport(await file.text());
    if(sequence!==importSequence)return;
    for(const [key,value]of Object.entries(imported.dimensions))$(key).value=value;
    $('pair-radius').value=imported.radius??'';$('pair-name').value=imported.name;
    // A new instrument must not inherit the previous instrument's thicknesses.
    $('thickness1').value='';$('thickness7').value='';
    $('import-message').textContent=`Imported ${imported.name||file.name}. Enter maximum thickness at frets 1 and 7 to generate the templates.`;
    updateFingerboard();
  } catch(error){
    if(sequence===importSequence)$('import-message').textContent=error.message;
  } finally {if(sequence===importSequence)$('overstand-file').value='';}
});
$('export-pair').addEventListener('click',()=>{
  if(!currentPair)return;
  const name=$('pair-name').value.trim().replace(/[^A-Za-z0-9.-]+/g,'-').replace(/^-+|-+$/g,'')||'Viol';
  download(exportTemplatePairSvg(currentPair),`${name}-F1-F7-underside-templates.svg`);
});
function scheduleDraw() {
  cancelAnimationFrame(drawFrame);
  drawFrame = requestAnimationFrame(drawProfile);
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
  ctx.fillStyle='#fdfcf9';ctx.fillRect(0,0,width,height);
  if(!p){
    ctx.fillStyle='#72766d';ctx.font='13px Arial';ctx.textAlign='center';
    ctx.fillText(`Enter measurements above to review F${selectedFret}.`,width/2,height/2);
    $('profile-canvas').setAttribute('aria-label',`Fret ${selectedFret}: enter valid measurements to see the section.`);return;
  }
  const narrow = width < 440;
  const sidePadding = narrow ? 36 : 70;
  // Both tabs share a scale and crown position so the same circle looks the
  // same on screen. Fit the wider/deeper section, regardless of active tab.
  const maxWidth=Math.max(...currentSections.map(s=>s.profile.params.width));
  const maxThickness=Math.max(...currentSections.map(s=>s.profile.params.thickness));
  const scale = Math.min((width - sidePadding * 2) / maxWidth, (height - 165) / maxThickness);
  const cx = width / 2, cy = (height - 60) / 2 - maxThickness * scale / 2;
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
  $('profile-canvas').setAttribute('aria-label', `Fret ${selectedFret} profile: width ${p.params.width} mm, crown radius ${p.params.radius} mm, maximum thickness ${p.params.thickness} mm, corner drop ${fieldValue('cornerDrop',p).toFixed(2)} mm.`);
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
$('view-source').addEventListener('click', () => {
  const reference = $('reference').value;
  if (!REFERENCES[reference]) return;
  $('source-title').textContent = `${reference === 'meares1' ? 'Meares 1' : 'Meares 2'} · original drawing`;
  $('source-image').src = `./public/${reference}.png`;
  $('source-dialog').showModal();
});
$('close-dialog').addEventListener('click', () => $('source-dialog').close());
$('source-dialog').addEventListener('click', event => { if (event.target === $('source-dialog')) $('source-dialog').close(); });
const observer = new ResizeObserver(scheduleDraw);
observer.observe($('profile-canvas').parentElement);
update();
