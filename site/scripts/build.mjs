import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
await rm(dist, { recursive: true, force: true });
await mkdir(resolve(dist, 'client'), { recursive: true });
await mkdir(resolve(dist, 'server'), { recursive: true });
await mkdir(resolve(dist, '.openai'), { recursive: true });
const modules = ['profile.js', 'fingerboard.js', 'overstand.js', 'references.js', 'stencil-font.js', 'template.js', 'template-pair.js', 'app.js'];
let javascript = '';
for (const file of modules) {
  const source = await readFile(resolve(root, 'src', file), 'utf8');
  javascript += '\n' + source.replace(/^import .*;\n/gm, '').replace(/^export /gm, '');
}
// The standalone HTML embeds every reference image; no font or module fetches.
const images = {};
for (const name of ['meares1', 'meares2'])
  images[name] = 'data:image/png;base64,' + (await readFile(resolve(root, 'public', name + '.png'))).toString('base64');
javascript = 'const EMBEDDED_IMAGES = ' + JSON.stringify(images) + ';\n' + javascript;
javascript = javascript.replace('`./public/${reference}.png`', 'EMBEDDED_IMAGES[reference]');
const css = await readFile(resolve(root, 'src/style.css'), 'utf8');
let html = await readFile(resolve(root, 'index.html'), 'utf8');
const fontLicense = await readFile(resolve(root, 'FONT-LICENSE.txt'), 'utf8');
html = html.replace('<head>', () => '<head>\n<!-- Embedded stencil-font license:\n' + fontLicense.replace(/--/g, '—') + '\n-->');
html = html.replace('<link rel="stylesheet" href="./src/style.css">', () => `<style>${css}</style>`);
html = html.replace('<script type="module" src="./src/app.js"></script>', () => `<script type="module">${javascript.replace(/<\/script/gi, '<\\/script')}</script>`);
await writeFile(resolve(dist, 'client/index.html'), html);
await cp(resolve(root, 'FONT-LICENSE.txt'), resolve(dist, 'client/FONT-LICENSE.txt'));
const contentHash = createHash('sha256').update(html).digest('hex');
// Hosting serves a static document only. All shape calculations stay client-side.
const worker = `const HTML = ${JSON.stringify(html)};\nexport default { async fetch(request) {\nconst url = new URL(request.url);\nif (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed', {status:405,headers:{Allow:'GET, HEAD'}});\nif (url.pathname !== '/' && url.pathname !== '/index.html') return new Response('Not found', {status:404});\nreturn new Response(request.method === 'HEAD' ? null : HTML, {headers:{'Content-Type':'text/html; charset=utf-8','X-Content-Type-Options':'nosniff','ETag':'"${contentHash}"'}});\n} };\n`;
await writeFile(resolve(dist, 'server/index.js'), worker);
await cp(resolve(root, '.openai/hosting.json'), resolve(dist, '.openai/hosting.json'));
await writeFile(resolve(dist, 'manifest.json'), JSON.stringify({ entry: 'client/index.html', sha256: contentHash, selfContained: true }, null, 2) + '\n');
console.log('Built standalone client-side app and static hosting entrypoint.');
