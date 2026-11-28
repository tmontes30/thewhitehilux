// Etiqueta TWH estampada en el cuello interior de las prendas: logo + talla (60 x 40 mm).
// Uso: node disenos/etiquetas/generar.js
// Salida (disenos/etiquetas/):
//   svg/etiqueta-<version>-<talla>.svg   vectorial
//   png/etiqueta-<version>-<talla>.png   600 dpi, fondo transparente (para la imprenta / DTF)
//   _todas.png                           hoja de revisión
// Dos versiones (el dibujo está en disenos/configurador/etiqueta.js, el mismo que muestra el configurador):
//   clara  → prendas negras (1 tinta crema)
//   oscura → prendas blancas (1 tinta grafito)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const E = require('../configurador/etiqueta.js');

const HERE = __dirname;
const MM_W = 60, MM_H = 40, DPI = 600;
const PX_W = Math.round((MM_W / 25.4) * DPI), PX_H = Math.round((MM_H / 25.4) * DPI);

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!edge) throw new Error('No encontré Microsoft Edge para generar los PNG.');
const tmpDir = path.join(HERE, '_tmp');
for (const d of ['svg', 'png']) {
  fs.mkdirSync(path.join(HERE, d), { recursive: true });
  // borra versiones que ya no existen (ej. la antigua "color")
  for (const f of fs.readdirSync(path.join(HERE, d))) if (!Object.keys(E.VERSIONES).some((k) => f.startsWith(`etiqueta-${k}-`))) fs.unlinkSync(path.join(HERE, d, f));
}
fs.mkdirSync(tmpDir, { recursive: true });

function png(html, out, w, h, transparent) {
  const f = path.join(tmpDir, 'pagina.html');
  fs.writeFileSync(f, html);
  const args = ['--headless=new', '--edge-skip-compat-layer-relaunch', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmpDir, 'edge')}`, `--window-size=${w},${h}`, `--screenshot=${out}`];
  if (transparent) args.push('--default-background-color=00000000');
  args.push('file:///' + f.replace(/\\/g, '/'));
  execFileSync(edge, args, { stdio: 'ignore' });
}

for (const k of Object.keys(E.VERSIONES)) {
  for (const t of E.TALLAS) {
    const name = `etiqueta-${k}-${t}`;
    fs.writeFileSync(path.join(HERE, 'svg', name + '.svg'), E.svg(t, k));
    png(`<!doctype html><html><body style="margin:0;background:transparent">${E.svg(t, k, { width: PX_W, height: PX_H })}</body></html>`, path.join(HERE, 'png', name + '.png'), PX_W, PX_H, true);
    process.stdout.write('.');
  }
}

// Hoja de revisión: cada versión sobre el color de prenda que le corresponde
const filas = Object.entries(E.VERSIONES).map(([k, v]) => `
  <h2>${v.nombre}</h2>
  <div class="row">${E.TALLAS.map((t) => `<div class="cell" style="background:${v.fondo}">${E.svg(t, k, { width: 240, height: 160 })}</div>`).join('')}</div>`).join('');
png(`<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:28px 32px;background:#E9E9E6;font-family:'Segoe UI',Arial,sans-serif;color:#1B1C1A}
  h1{margin:0 0 4px;font-size:22px} p{margin:0 0 18px;color:#6B706C;font-size:14px}
  h2{font-size:15px;margin:18px 0 8px} .row{display:flex;gap:14px}
  .cell{padding:18px 20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
</style></head><body><h1>Etiqueta TWH · cuello interior</h1><p>60 × 40 mm · logo + talla · PNG 600 dpi con fondo transparente en disenos/etiquetas/png/</p>${filas}</body></html>`,
  path.join(HERE, '_todas.png'), 1580, 620, false);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nListo: ${Object.keys(E.VERSIONES).length * E.TALLAS.length} etiquetas (${PX_W}x${PX_H} px a ${DPI} dpi) y _todas.png`);
