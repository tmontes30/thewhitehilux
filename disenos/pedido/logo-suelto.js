// Un logo suelto para el proveedor, a tamaño real y en contornos (sin tipografías ni bordes): PDF + SVG.
// Uso: node disenos/pedido/logo-suelto.js <logo> <ancho-cm> [clara|oscura]
//   ej: node disenos/pedido/logo-suelto.js coordenadas 10 clara
//   tinta clara = para prenda negra (logo claro) · tinta oscura = para prenda blanca
// Sale en pedido-proveedor/sueltos/<fecha>/ (carpeta privada, no se sube a GitHub).
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const { contornos } = require('./contornos');

const [logo, cmArg, tintaArg] = process.argv.slice(2);
if (!logo || !cmArg) { console.log('Uso: node disenos/pedido/logo-suelto.js <logo> <ancho-cm> [clara|oscura]'); process.exit(1); }
const cm = Number(cmArg), tinta = tintaArg === 'oscura' ? 'oscura' : 'clara';
const ROOT = path.join(__dirname, '..', '..');
global.window = {};
require(path.join(ROOT, 'disenos', 'configurador', 'datos.js'));
const meta = window.TWH_CFG.logos.find((l) => l.id === logo);
if (!meta) { console.log('No existe el logo "' + logo + '" (ver disenos/configurador/datos.js)'); process.exit(1); }
const C = require(path.join(ROOT, 'web', 'assets', 'js', 'core.js'));

// SVG recortado a lo dibujado, con su ancho real en cm (igual que generar-pedido.js)
const src = fs.readFileSync(path.join(ROOT, 'web', 'assets', 'logos', logo + (tinta === 'oscura' ? '-claro' : '') + '.svg'), 'utf8');
const [vx, vy, vw, vh] = src.match(/viewBox="([^"]+)"/)[1].split(/\s+/).map(Number);
const x = vx + meta.l * vw, y = vy + meta.t * vh, w = (meta.r - meta.l) * vw, h = (meta.b - meta.t) * vh;
const hcm = Math.round((cm * h / w) * 10) / 10;
const svg0 = src.replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`).replace(/width="[^"]+" height="[^"]+"/, `width="${cm}cm" height="${hcm}cm"`);

const OUT = path.join(ROOT, 'pedido-proveedor', 'sueltos', C.todayCL());
fs.mkdirSync(OUT, { recursive: true });
const base = `${logo}-${cm}cm-tinta-${tinta}`;
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
(async () => {
  const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  const r = await contornos(page, svg0);
  if (r.avisos.length) console.log('⚠', r.avisos.join('; '));
  fs.writeFileSync(path.join(OUT, base + '.svg'), r.svg);
  await page.setContent(`<!doctype html><html><head><style>@page{size:${cm}cm ${hcm}cm;margin:0}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${r.svg}</body></html>`);
  await page.pdf({ path: path.join(OUT, base + '.pdf'), width: `${cm}cm`, height: `${hcm}cm`, printBackground: false, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
  await browser.close();
  console.log(`Listo: ${path.relative(ROOT, path.join(OUT, base))}.pdf y .svg (${cm} × ${hcm} cm, en contornos)`);
})().catch((e) => { console.error(e); process.exit(1); });
