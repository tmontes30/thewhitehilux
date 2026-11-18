// Etiqueta TWH estampada en el cuello interior de las poleras: logo + talla.
// Uso: node disenos/etiquetas/generar.js
// Salida (disenos/etiquetas/):
//   svg/etiqueta-<version>-<talla>.svg   vectorial
//   png/etiqueta-<version>-<talla>.png   600 dpi, fondo transparente (para la imprenta / DTF)
//   _todas.png                           hoja de revisión con todas las versiones
// Versiones: "clara" (1 tinta crema, para polera negra), "oscura" (1 tinta grafito, para polera blanca),
//            "color" (colores de la marca, para polera negra).
// Medida: 60 x 40 mm (viewBox en décimas de mm: 600 x 400).
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const MM_W = 60, MM_H = 40, DPI = 600;
const PX_W = Math.round((MM_W / 25.4) * DPI), PX_H = Math.round((MM_H / 25.4) * DPI);
const TALLAS = ['S', 'M', 'L', 'XL', 'XXL'];
const FONT = "'Arial Black', 'Segoe UI Black', Arial, sans-serif";

const VERSIONES = {
  clara: { fondo: '#1B1C1A', texto: '#F2F0E8', franjas: ['#F2F0E8', '#F2F0E8', '#F2F0E8'], caja: '#F2F0E8', cajaTexto: null, linea: '#F2F0E8' },
  oscura: { fondo: '#FFFFFF', texto: '#1B1C1A', franjas: ['#1B1C1A', '#1B1C1A', '#1B1C1A'], caja: '#1B1C1A', cajaTexto: null, linea: '#1B1C1A' },
  color: { fondo: '#1B1C1A', texto: '#F2F0E8', franjas: ['#F2A541', '#E4572E', '#B3202A'], caja: '#E39B2D', cajaTexto: '#1B1C1A', linea: '#E39B2D' },
};

// Etiqueta: mismo dibujo que el logo oficial "THE WHITE HILUX · CL SHOP" (web/assets/logos/logo-shop.svg),
// arriba; abajo la talla grande. En las versiones de 1 tinta, "CL SHOP" va calado (sin tinta) dentro de su caja.
function etiqueta(talla, v, k) {
  const id = `m-${k}-${talla}`;
  const cal = !v.cajaTexto;
  const ancho = talla.length >= 3 ? 330 : talla.length === 2 ? 260 : null; // XL/XXL más angostas
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="${MM_W}mm" height="${MM_H}mm">
  <defs>${cal ? `<mask id="${id}"><rect x="0" y="0" width="566" height="120" fill="#fff"/><g transform="translate(470 97) skewX(-12)"><text x="0" y="0" font-family="${FONT}" font-size="24" fill="#000" text-anchor="middle" letter-spacing="4">CL SHOP</text></g></mask>` : ''}</defs>
  <g transform="translate(37 22) scale(0.93) translate(0 -8)">
    <g transform="translate(14 58) skewX(-12)"><text x="0" y="0" font-family="${FONT}" font-size="50" fill="${v.texto}" textLength="510" lengthAdjust="spacingAndGlyphs">THE WHITE HILUX</text></g>
    <path d="M8 74 H372 L366 80 H8 Z" fill="${v.franjas[0]}"/>
    <path d="M8 83 H362 L356 89 H8 Z" fill="${v.franjas[1]}"/>
    <path d="M8 92 H352 L346 98 H8 Z" fill="${v.franjas[2]}"/>
    <path d="M392 72 H556 L546 104 H382 Z" fill="${v.caja}"${cal ? ` mask="url(#${id})"` : ''}/>
    ${cal ? '' : `<g transform="translate(470 97) skewX(-12)"><text x="0" y="0" font-family="${FONT}" font-size="24" fill="${v.cajaTexto}" text-anchor="middle" letter-spacing="4">CL SHOP</text></g>`}
  </g>
  <rect x="60" y="148" width="480" height="4" fill="${v.linea}" opacity=".9"/>
  <text x="300" y="352" font-family="${FONT}" font-size="190" fill="${v.texto}" text-anchor="middle"${ancho ? ` textLength="${ancho}" lengthAdjust="spacingAndGlyphs"` : ''}>${talla}</text>
</svg>`;
}

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (!edge) throw new Error('No encontré Microsoft Edge para generar los PNG.');
const tmpDir = path.join(HERE, '_tmp');
fs.mkdirSync(path.join(HERE, 'svg'), { recursive: true });
fs.mkdirSync(path.join(HERE, 'png'), { recursive: true });
fs.mkdirSync(tmpDir, { recursive: true });

function png(html, out, w, h, transparent) {
  const f = path.join(tmpDir, 'pagina.html');
  fs.writeFileSync(f, html);
  const args = ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--user-data-dir=${path.join(tmpDir, 'edge')}`, `--window-size=${w},${h}`, `--screenshot=${out}`];
  if (transparent) args.push('--default-background-color=00000000');
  args.push('file:///' + f.replace(/\\/g, '/'));
  execFileSync(edge, args, { stdio: 'ignore' });
}

for (const [k, v] of Object.entries(VERSIONES)) {
  for (const t of TALLAS) {
    const svg = etiqueta(t, v, k);
    const name = `etiqueta-${k}-${t}`;
    fs.writeFileSync(path.join(HERE, 'svg', name + '.svg'), svg);
    const big = svg.replace(`width="${MM_W}mm" height="${MM_H}mm"`, `width="${PX_W}" height="${PX_H}"`);
    png(`<!doctype html><html><body style="margin:0;background:transparent">${big}</body></html>`, path.join(HERE, 'png', name + '.png'), PX_W, PX_H, true);
    process.stdout.write('.');
  }
}

// Hoja de revisión: cada versión sobre el color de polera que le corresponde
const filas = Object.entries(VERSIONES).map(([k, v]) => `
  <h2>${k === 'clara' ? '1 tinta clara · polera negra' : k === 'oscura' ? '1 tinta oscura · polera blanca' : 'A color · polera negra'}</h2>
  <div class="row">${TALLAS.map((t) => `<div class="cell" style="background:${v.fondo}">${etiqueta(t, v, 'h' + k).replace(`width="${MM_W}mm" height="${MM_H}mm"`, 'width="240" height="160"')}</div>`).join('')}</div>`).join('');
png(`<!doctype html><html><head><meta charset="utf-8"><style>
  body{margin:0;padding:28px 32px;background:#E9E9E6;font-family:'Segoe UI',Arial,sans-serif;color:#1B1C1A}
  h1{margin:0 0 4px;font-size:22px} p{margin:0 0 18px;color:#6B706C;font-size:14px}
  h2{font-size:15px;margin:18px 0 8px} .row{display:flex;gap:14px}
  .cell{padding:18px 20px;border-radius:10px;box-shadow:0 1px 4px rgba(0,0,0,.12)}
</style></head><body><h1>Etiqueta TWH · cuello interior</h1><p>60 × 40 mm · logo + talla · PNG 600 dpi con fondo transparente en disenos/etiquetas/png/</p>${filas}</body></html>`,
  path.join(HERE, '_todas.png'), 1580, 880, false);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\nListo: ${Object.keys(VERSIONES).length * TALLAS.length} etiquetas (${PX_W}x${PX_H} px a ${DPI} dpi) y _todas.png`);
