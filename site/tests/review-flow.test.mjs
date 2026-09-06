import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as profile from '../src/profile.js';
import { REFERENCES } from '../src/references.js';
import * as fingerboard from '../src/fingerboard.js';
import * as templates from '../src/template-pair.js';
import * as overstand from '../src/overstand.js';
import * as threeMf from '../src/three-mf.js';

// Exercise real application event handlers with a small DOM adapter. Geometry,
// file creation, validation and tab selection use the production modules.
function app() {
  const elements=new Map(),downloads=[],blobs=new Map();let nextUrl=0,pending;
  class Element {
    constructor(){this.value='';this.children=[];this.listeners={};this.attributes={};this.disabled=false;this.checked=false;this.parentElement={};this.classList={add(){},remove(){},toggle(){}};}
    set textContent(value){this.text=String(value);this.children=[];}
    get textContent(){return this.text||this.children.map(c=>c.textContent).join('');}
    append(...children){this.children.push(...children);}
    replaceChildren(...children){this.text='';this.children=children;}
    setAttribute(key,value){this.attributes[key]=value;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    emit(type,details={}){return Promise.all((this.listeners[type]||[]).map(fn=>fn({target:this,preventDefault(){},...details})));}
    click(){if(this.download)downloads.push({name:this.download,blob:blobs.get(this.href)});else return this.emit('click');}
    focus(){} remove(){} showModal(){} close(){}
    getBoundingClientRect(){return {width:800,height:420};}
    getContext(){return new Proxy({},{get:()=>()=>{},set:()=>true});}
  }
  const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
  for(const match of html.matchAll(/<\w+\b[^>]*\bid="([^"]+)"[^>]*>/g)){
    const element=new Element();element.value=match[0].match(/\bvalue="([^"]*)"/)?.[1]||'';
    element.disabled=/\bdisabled\b/.test(match[0]);element.checked=/\bchecked\b/.test(match[0]);elements.set(match[1],element);
  }
  const document={getElementById:id=>{assert.ok(elements.has(id),`missing UI element ${id}`);return elements.get(id);},createElement:()=>new Element(),createTextNode:text=>({textContent:text}),body:new Element()};
  const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  runInNewContext(source,{...profile,...fingerboard,...templates,...overstand,...threeMf,REFERENCES,document,window:{devicePixelRatio:1},Blob,
    URL:{createObjectURL:blob=>{const url=`blob:${++nextUrl}`;blobs.set(url,blob);return url;},revokeObjectURL:url=>blobs.delete(url)},
    ResizeObserver:class{observe(){}},requestAnimationFrame:fn=>{pending=fn;return 1;},cancelAnimationFrame(){},setTimeout(){}});
  return {get:id=>elements.get(id),downloads,render:()=>pending?.(),async input(id,value){const e=elements.get(id);e.value=String(value);await e.emit('input');}};
}
async function enterMeasurements(ui){
  for(const [key,value]of Object.entries({nutWidth:42,endWidth:62,boardLength:256,stringLength:390,thickness1:20,thickness7:22,'pair-radius':55,'pair-name':'Viol'}))await ui.input(key,value);
}
test('review tabs show measured F1/F7 and export the selected full-size outline',async()=>{
  const ui=app();assert.equal(ui.get('export-outline').disabled,true);
  await enterMeasurements(ui);ui.render();
  assert.match(ui.get('metric-width').textContent,/43.71/);assert.match(ui.get('metric-thickness').textContent,/20.00/);
  await ui.get('tab-f7').click();ui.render();
  assert.equal(ui.get('tab-f7').attributes['aria-selected'],'true');
  assert.match(ui.get('metric-width').textContent,/52.13/);assert.match(ui.get('metric-thickness').textContent,/22.00/);
  await ui.get('export-outline').click();
  assert.equal(ui.downloads.at(-1).name,'Viol-F7-outline.svg');
  assert.match(await ui.downloads.at(-1).blob.text(),/width="62\.13329909662838mm"/);
  await ui.get('tab-f7').emit('keydown',{key:'Home'});assert.equal(ui.get('tab-f1').attributes['aria-selected'],'true');
});
test('rounding follows the reviewed fret and name errors do not block outline review',async()=>{
  const ui=app();await enterMeasurements(ui);
  await ui.input('cornerDrop-number',.5);assert.match(ui.get('metric-cornerDrop').textContent,/0.50/);
  await ui.get('tab-f7').click();assert.match(ui.get('metric-cornerDrop').textContent,/0.55/);
  await ui.input('pair-name','W'.repeat(29));
  assert.equal(ui.get('export-pair').disabled,true);assert.equal(ui.get('export-3mf').disabled,true);
  assert.equal(ui.get('export-outline').disabled,false);assert.match(ui.get('metric-width').textContent,/52.13/);
  await ui.input('thickness7','');assert.equal(ui.get('export-outline').disabled,true);ui.render();
});
test('both template formats follow review and 3MF thickness validation leaves SVG available',async()=>{
  const ui=app();await enterMeasurements(ui);
  assert.equal(ui.get('print-thickness').value,'1.5');
  await ui.get('export-3mf').click();assert.match(ui.downloads.at(-1).name,/-1\.5mm\.3mf$/);
  const bytes=await ui.downloads.at(-1).blob.arrayBuffer();assert.equal(new DataView(bytes).getUint32(0,true),0x04034b50);
  await ui.input('print-thickness','');assert.equal(ui.get('export-3mf').disabled,true);assert.equal(ui.get('export-pair').disabled,false);
  await ui.get('export-pair').click();assert.match(ui.downloads.at(-1).name,/-underside-templates\.svg$/);
});
