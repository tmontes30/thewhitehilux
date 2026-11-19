// Pedido de producción para el proveedor: documento (HTML + PDF), logos en PDF a tamaño real y etiquetas en PDF.
// Uso: node disenos/pedido/generar-pedido.js
// Salida: pedido-proveedor/<fecha>/  (carpeta privada, no se sube a GitHub)
//
// Reglas de este pedido (editar aquí para el próximo):
//   - Poleras con logo adelante y atrás → solo NEGRO
//   - Poleras solo con logo adelante    → NEGRO y BLANCO
//   - Curva por modelo y color: CURVA (general) o CURVA_MODELO (para modelos puntuales)
// Medidas de estampado (ancho de lo impreso, referenciales; confirmar con el proveedor):
const CURVA = { M: 1, L: 2, XL: 3, XXL: 3 };
// Modelos con otra curva (id del producto → curva). Pedido 2026-11-18: estos 6 solo en L, XL y XXL
const CURVA_SIN_M = { M: 0, L: 2, XL: 2, XXL: 2 };
const CURVA_MODELO = {
  'polera-twh-4x4-rally-team-algodon': CURVA_SIN_M,     // White Hilux Script
  'polera-mud-terrain-twh-algodon': CURVA_SIN_M,        // Race Shop
  'polera-low-range-club-4wd': CURVA_SIN_M,             // Low Range Club
  'polera-twh-cruz-white-hilux-algodon': CURVA_SIN_M,   // Sunset
  'polera-twh-recovery': CURVA_SIN_M,                   // Recovery Crew
  'polera-twh': CURVA_SIN_M,                            // Warp
  'polera-twh-aired-down': CURVA_SIN_M,                 // Aired Down
};
const curvaDe = (m) => CURVA_MODELO[m.p.id] || CURVA;
const ANCHO_CM = { pecho: { s: 8, m: 10, l: 12 }, centro: { s: 10, m: 14, l: 18 }, espalda: { s: 22, m: 26, l: 30 } };
const UBICACION = {
  pecho: 'Pecho izquierdo (lado del corazón), centro del logo a ~9 cm de la costura del cuello y ~9 cm del centro de la polera',
  centro: 'Centro del pecho, borde superior a ~8 cm de la costura del cuello',
  espalda: 'Centro de la espalda, borde superior a ~8 cm de la costura del cuello',
};
const ETIQUETA = { ancho: 6, alto: 4, ubicacion: 'Cuello interior (espalda), centrada, bajo la costura' };

const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..', '..');
const WEB = path.join(ROOT, 'web');
const base = require(path.join(WEB, 'data', 'catalog.js'));
const C = require(path.join(WEB, 'assets', 'js', 'core.js'));
const E = require(path.join(ROOT, 'disenos', 'configurador', 'etiqueta.js'));
global.window = {};
require(path.join(ROOT, 'disenos', 'configurador', 'datos.js'));
const LOGOS = {};
window.TWH_CFG.logos.forEach((l) => (LOGOS[l.id] = l));

const hoy = C.todayCL();
const OUT = path.join(ROOT, 'pedido-proveedor', hoy);
fs.mkdirSync(path.join(OUT, 'logos'), { recursive: true });
fs.mkdirSync(path.join(OUT, 'etiquetas'), { recursive: true });

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const TALLAS = Object.keys(CURVA);
const suma = (cv) => TALLAS.reduce((s, t) => s + (cv[t] || 0), 0);
const txtCurva = (cv) => TALLAS.filter((t) => cv[t]).map((t) => `${cv[t]} ${t}`).join(' · ') + ` = ${suma(cv)}`;
const COLOR = { negro: 'Negro', blanco: 'Blanco' };

// ---------- modelos del pedido ----------
const cat = C.mergeCatalog(base, null);
const modelos = cat.products.filter((p) => p.type === 'polera' && p.cfg).map((p, i) => {
  const c = p.cfg;
  const colores = c.espalda ? ['negro'] : ['negro', 'blanco'];
  return { n: i + 1, p, c, colores, etiqueta: c.etiqueta !== false };
});

// ---------- archivos de logos (uno por logo + ubicación + tamaño + tinta) ----------
const archivos = new Map(); // clave → { file, logo, lugar, cm, tinta, usos: [] }
function archivoLogo(logoId, lugar, tam, color) {
  const cm = ANCHO_CM[lugar][tam || 'm'];
  const tinta = color === 'blanco' ? 'oscura' : 'clara';
  const key = [logoId, lugar, cm, tinta].join('|');
  if (!archivos.has(key)) {
    const num = String(archivos.size + 1).padStart(2, '0');
    const file = `${num}-${lugar.toUpperCase()}-${logoId}-${cm}cm-tinta-${tinta}.pdf`;
    archivos.set(key, { file, logo: logoId, lugar, cm, tinta, usos: [] });
  }
  return archivos.get(key);
}
modelos.forEach((m) => m.colores.forEach((col) => {
  const lugarF = m.c.frente && (m.c.frente.pos === 'centro' ? 'centro' : 'pecho');
  m[col] = {
    frente: m.c.frente ? archivoLogo(m.c.frente.logo, lugarF, m.c.frente.tam, col) : null,
    espalda: m.c.espalda ? archivoLogo(m.c.espalda.logo, 'espalda', m.c.espalda.tam, col) : null,
  };
  if (m[col].frente) m[col].frente.usos.push(`${m.p.name} · ${COLOR[col]}`);
  if (m[col].espalda) m[col].espalda.usos.push(`${m.p.name} · ${COLOR[col]}`);
}));

// SVG del logo recortado a lo dibujado, con su ancho real en cm
function svgLogo(a) {
  const meta = LOGOS[a.logo];
  const src = fs.readFileSync(path.join(WEB, 'assets', 'logos', a.logo + (a.tinta === 'oscura' ? '-claro' : '') + '.svg'), 'utf8');
  const vb = (src.match(/viewBox="([^"]+)"/) || [])[1].split(/\s+/).map(Number);
  const [vx, vy, vw, vh] = vb;
  const x = vx + meta.l * vw, y = vy + meta.t * vh, w = (meta.r - meta.l) * vw, h = (meta.b - meta.t) * vh;
  const hcm = Math.round((a.cm * h / w) * 10) / 10;
  const svg = src.replace(/viewBox="[^"]+"/, `viewBox="${x} ${y} ${w} ${h}"`).replace(/width="[^"]+" height="[^"]+"/, `width="${a.cm}cm" height="${hcm}cm"`);
  return { svg, hcm };
}

// ---------- cantidades ----------
const filas = [];
modelos.forEach((m) => m.colores.forEach((col) => filas.push({ m, col, cant: { ...curvaDe(m) }, total: suma(curvaDe(m)) })));
const total = filas.reduce((s, f) => s + f.total, 0);
// compra.json: para importar en el panel (pestaña Compras). El costo total se pasa al correr el script
// (node disenos/pedido/generar-pedido.js --costo=909350) y queda solo en esta carpeta privada.
const costoArg = (process.argv.find((a) => a.startsWith('--costo=')) || '').split('=')[1];
fs.writeFileSync(path.join(OUT, 'compra.json'), JSON.stringify({
  tipo: 'twh-compra',
  fecha: hoy,
  proveedor: '',
  nota: `Pedido a proveedor ${hoy} (${total} poleras)`,
  costoTotal: Number(String(costoArg || '').replace(/\D/g, '')) || 0,
  lineas: filas.flatMap((f) => TALLAS.filter((t) => f.cant[t]).map((t) => ({ id: f.m.p.id, nombre: f.m.p.name, color: f.col, talla: t, cantidad: f.cant[t] }))),
}, null, 2));
const porColorTalla = {};
filas.forEach((f) => TALLAS.forEach((t) => { porColorTalla[f.col] = porColorTalla[f.col] || {}; porColorTalla[f.col][t] = (porColorTalla[f.col][t] || 0) + f.cant[t]; }));
const estampados = { frente: 0, espalda: 0 };
filas.forEach((f) => { if (f.m.c.frente) estampados.frente += f.total; if (f.m.c.espalda) estampados.espalda += f.total; });
const etiquetas = {};
filas.filter((f) => f.m.etiqueta).forEach((f) => TALLAS.forEach((t) => { const k = E.versionPara(f.col); etiquetas[k] = etiquetas[k] || {}; etiquetas[k][t] = (etiquetas[k][t] || 0) + f.cant[t]; }));

// ---------- documento ----------
let MODE = 'html'; // 'pdf': los links saltan a la página del logo dentro del mismo PDF; 'html': abren el archivo
const ancla = (a) => 'lg-' + a.file.slice(0, 2);
const linkLogo = (a, label) => `<a class="file" href="${MODE === 'pdf' ? '#' + ancla(a) : 'logos/' + encodeURIComponent(a.file)}">${esc(label || a.file)}</a>`;
const linkEt = (k, t) => `<a class="file" href="${MODE === 'pdf' ? '#etiquetas-real' : 'etiquetas/etiqueta-' + k + '-' + t + '.pdf'}">etiqueta-${k}-${t}.pdf</a>`;
const img = (rel) => (rel ? 'file:///' + path.join(WEB, rel).replace(/\\/g, '/') : '');
const fotos = (p, col) => {
  const imgs = C.orderedImages(p, col);
  return { frente: imgs.find((s) => /-frente\.\w+$/.test(s)), espalda: imgs.find((s) => /-espalda/.test(s)) };
};
const logoCell = (a, lugar) => {
  if (!a) return `<td class="muted">— sin estampado —</td>`;
  const { svg, hcm } = svgLogo(a);
  return `<td><div class="logo-prev ${a.tinta}">${svg.replace(/width="[^"]+" height="[^"]+"/, 'width="100%" height="70"')}</div>
    <b>${esc(LOGOS[a.logo].name)}</b><br>${a.cm} × ${hcm} cm · tinta ${a.tinta === 'clara' ? 'clara (sobre negro)' : 'oscura (sobre blanco)'}<br>${linkLogo(a)}<br><small>${esc(UBICACION[lugar])}</small></td>`;
};
function construir(modo) {
MODE = modo;
const tabla = (rows, head) => `<table class="q"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`;

const fichas = modelos.map((m) => {
  const sku = m.p.sku;
  return `<section class="ficha">
    <h2><span class="num">${m.n}</span> ${esc(m.p.name)} <small>SKU ${esc(sku)}</small></h2>
    ${m.colores.map((col) => {
      const f = fotos(m.p, col);
      return `<div class="color-block">
        <div class="fotos">${f.frente ? `<img src="${img(f.frente)}">` : ''}${f.espalda ? `<img src="${img(f.espalda)}">` : ''}</div>
        <div class="det">
          <p class="col"><span class="dot ${col}"></span> Polera <b>${COLOR[col]}</b></p>
          <table class="specs"><tr><th>Frente</th><th>Espalda</th></tr><tr>${logoCell(m[col].frente, m.c.frente && (m.c.frente.pos === 'centro' ? 'centro' : 'pecho'))}${logoCell(m[col].espalda, 'espalda')}</tr></table>
          <p class="et">Etiqueta cuello: ${m.etiqueta ? `<b>sí</b> · ${TALLAS.filter((t) => curvaDe(m)[t]).map((t) => linkEt(E.versionPara(col), t)).join(' · ')}` : 'no'}</p>
          ${tabla([`<tr><td>${COLOR[col]}</td>${TALLAS.map((t) => `<td>${curvaDe(m)[t] || '—'}</td>`).join('')}<td><b>${suma(curvaDe(m))}</b></td></tr>`], ['Color', ...TALLAS, 'Total'])}
        </div></div>`;
    }).join('')}
  </section>`;
}).join('');

const resumen = tabla(
  filas.map((f) => `<tr><td>${f.m.n}. ${esc(f.m.p.name)}</td><td>${COLOR[f.col]}</td><td>${f.m.c.espalda ? 'Pecho + espalda' : 'Solo pecho'}</td>${TALLAS.map((t) => `<td>${f.cant[t]}</td>`).join('')}<td><b>${f.total}</b></td></tr>`)
    .concat([`<tr class="tot"><td colspan="3">TOTAL</td>${TALLAS.map((t) => `<td>${filas.reduce((s, f) => s + f.cant[t], 0)}</td>`).join('')}<td>${total}</td></tr>`]),
  ['Modelo', 'Color', 'Estampado', ...TALLAS, 'Total']);
const porColor = tabla(
  Object.keys(porColorTalla).map((col) => `<tr><td>${COLOR[col]}</td>${TALLAS.map((t) => `<td>${porColorTalla[col][t]}</td>`).join('')}<td><b>${TALLAS.reduce((s, t) => s + porColorTalla[col][t], 0)}</b></td></tr>`),
  ['Color', ...TALLAS, 'Total']);
const tablaEt = tabla(
  Object.keys(etiquetas).map((k) => `<tr><td>${E.VERSIONES[k].nombre}</td>${TALLAS.map((t) => `<td>${etiquetas[k][t] || 0}<br>${etiquetas[k][t] ? linkEt(k, t) : ''}</td>`).join('')}<td><b>${TALLAS.reduce((s, t) => s + (etiquetas[k][t] || 0), 0)}</b></td></tr>`),
  ['Etiqueta', ...TALLAS, 'Total']);
const tablaArch = tabla(
  [...archivos.values()].map((a) => `<tr><td>${linkLogo(a)}</td><td>${esc(LOGOS[a.logo].name)}</td><td>${a.lugar}</td><td>${a.cm} cm</td><td>${a.tinta}</td><td>${a.usos.length}</td></tr>`),
  ['Archivo', 'Logo', 'Ubicación', 'Ancho', 'Tinta', 'Modelos']);

// anexo: una página por logo (destino de los links) + etiquetas a tamaño real
const anexo = [...archivos.values()].map((a) => {
  const { svg, hcm } = svgLogo(a);
  const w = Math.min(a.cm, 17), h = Math.round((w * hcm / a.cm) * 10) / 10;
  return `<section class="anexo" id="${ancla(a)}">
    <h2><span class="num">${a.file.slice(0, 2)}</span> ${esc(LOGOS[a.logo].name)}</h2>
    <table class="specs"><tr><th>Archivo</th><td>${MODE === 'pdf' ? `<b>${esc(a.file)}</b> (carpeta logos/)` : linkLogo(a)}</td></tr>
      <tr><th>Medida impresa</th><td><b>${a.cm} × ${hcm} cm</b> (ancho × alto)</td></tr>
      <tr><th>Ubicación</th><td>${esc(UBICACION[a.lugar])}</td></tr>
      <tr><th>Tinta</th><td>${a.tinta === 'clara' ? 'Clara · para polera negra' : 'Oscura · para polera blanca'}</td></tr>
      <tr><th>Va en</th><td>${a.usos.map(esc).join('<br>')}</td></tr></table>
    <div class="big ${a.tinta}">${svg.replace(/width="[^"]+" height="[^"]+"/, `width="${w}cm" height="${h}cm"`)}</div>
    ${a.cm > 17 ? `<p class="muted-l">Vista reducida al ${Math.round(100 * 17 / a.cm)} % para que quepa en la hoja. El archivo PDF está a tamaño real.</p>` : '<p class="muted-l">Vista a tamaño real.</p>'}
    <p><a class="back" href="#archivos">↑ Volver a la lista de archivos</a></p></section>`;
}).join('') + `<section class="anexo" id="etiquetas-real"><h2>Etiquetas de cuello · tamaño real (${ETIQUETA.ancho} × ${ETIQUETA.alto} cm)</h2>
  <p>${esc(ETIQUETA.ubicacion)}. Archivos en la carpeta etiquetas/.</p>
  <div class="etq-real">${Object.keys(etiquetas).map((k) => TALLAS.filter((t) => etiquetas[k][t]).map((t) => `<div><div class="box" style="background:${E.VERSIONES[k].fondo}">${E.svg(t, k)}</div><b>etiqueta-${k}-${t}.pdf</b> · ${etiquetas[k][t]} un.</div>`).join('')).join('')}</div>
  <p><a class="back" href="#archivos">↑ Volver a la lista de archivos</a></p></section>`;

const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Pedido de producción TWH · ${hoy}</title><style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1B1C1A; font-size: 11.5px; margin: 0; padding: 24px; max-width: 1000px; }
  @media print { body { padding: 0; } }
  h1 { font-size: 22px; margin: 0; } h2 { font-size: 15px; margin: 0 0 8px; display: flex; align-items: center; gap: 8px; }
  h2 small { font-weight: 400; color: #6B706C; font-family: Consolas, monospace; }
  h3 { font-size: 13px; margin: 18px 0 6px; text-transform: uppercase; letter-spacing: .06em; color: #6B706C; }
  .head { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 4px solid #E39B2D; padding-bottom: 10px; margin-bottom: 14px; }
  .head img { height: 46px; } .meta { text-align: right; color: #4a4c48; line-height: 1.6; }
  .kpis { display: flex; gap: 10px; margin: 10px 0 4px; } .kpi { flex: 1; border: 1px solid #ddd; border-radius: 8px; padding: 8px 10px; } .kpi b { display: block; font-size: 20px; }
  table { border-collapse: collapse; width: 100%; } th, td { border: 1px solid #d8d8d4; padding: 5px 7px; text-align: left; vertical-align: top; }
  th { background: #F2F0E8; font-size: 10.5px; text-transform: uppercase; letter-spacing: .04em; }
  table.q td:not(:first-child), table.q th:not(:first-child) { text-align: center; }
  .tot td { background: #1B1C1A; color: #fff; font-weight: 700; }
  .file { font-family: Consolas, monospace; font-size: 10px; color: #2968C8; }
  .muted { color: #9a9c96; text-align: center; vertical-align: middle; }
  .ficha { border: 1px solid #d8d8d4; border-radius: 10px; padding: 12px; margin: 12px 0; page-break-inside: avoid; }
  .num { background: #1B1C1A; color: #E39B2D; border-radius: 6px; padding: 2px 8px; }
  .color-block { display: grid; grid-template-columns: 210px 1fr; gap: 12px; margin-top: 8px; }
  .color-block + .color-block { border-top: 1px dashed #ccc; padding-top: 10px; }
  .fotos { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; } .fotos img { width: 100%; border-radius: 6px; border: 1px solid #eee; }
  .det { display: grid; gap: 6px; align-content: start; } .col { margin: 0; font-size: 12px; } .et { margin: 0; }
  .dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; border: 1px solid #999; vertical-align: -1px; } .dot.negro { background: #1B1C1A; } .dot.blanco { background: #fff; }
  .specs td { width: 50%; font-size: 11px; } .logo-prev { border-radius: 6px; padding: 6px; margin-bottom: 4px; display: flex; justify-content: center; } .logo-prev.clara { background: #1B1C1A; } .logo-prev.oscura { background: #fff; border: 1px solid #ddd; }
  .note { background: #FFF2D9; border-left: 4px solid #E39B2D; padding: 8px 10px; border-radius: 6px; margin: 10px 0; }
  .etq { display: flex; gap: 8px; flex-wrap: wrap; } .etq div { border-radius: 6px; padding: 6px; text-align: center; font-size: 10px; } .etq svg { width: 120px; height: 80px; display: block; }
  .page-break { page-break-before: always; }
  a.file { color: #2968C8; text-decoration: underline; } a.back { color: #2968C8; font-weight: 600; }
  .anexo { page-break-before: always; } .anexo .specs th { width: 130px; } .anexo .specs td { width: auto; }
  .big { margin: 14px 0 6px; padding: 14px; border-radius: 8px; display: flex; justify-content: center; } .big.clara { background: #1B1C1A; } .big.oscura { background: #fff; border: 1px solid #ddd; }
  .muted-l { color: #6B706C; font-size: 10.5px; } .etq-real { display: grid; grid-template-columns: repeat(2, auto); gap: 14px; justify-content: start; } .etq-real .box { border: 1px solid #ccc; display: inline-block; margin-bottom: 3px; } .etq-real svg { display: block; }
</style></head><body>
<div class="head"><img src="logo-twh.svg"><div><h1>Pedido de producción · Poleras TWH</h1><div>The White Hilux · CL Shop</div></div>
  <div class="meta">Fecha: <b>${hoy.split('-').reverse().join('-')}</b><br>Proveedor: ____________________<br>Contacto: +56 9 9225 9960</div></div>

<div class="kpis"><div class="kpi"><b>${total}</b>poleras</div><div class="kpi"><b>${modelos.length}</b>modelos</div><div class="kpi"><b>${estampados.frente}</b>estampados pecho</div><div class="kpi"><b>${estampados.espalda}</b>estampados espalda</div><div class="kpi"><b>${Object.values(etiquetas).reduce((s, o) => s + Object.values(o).reduce((a, b) => a + b, 0), 0)}</b>etiquetas cuello</div></div>

<div class="note"><b>Curvas (por modelo y color):</b> ${[...new Set(modelos.map((m) => txtCurva(curvaDe(m))))].map((c) => `modelos ${modelos.filter((m) => txtCurva(curvaDe(m)) === c).map((m) => m.n).join(', ')} → <b>${c}</b>`).join(' &nbsp;|&nbsp; ')}. Modelos con logo adelante y atrás: solo negro. Modelos solo con logo adelante: negro y blanco.<br>
Los logos van en PDF vectorial a tamaño real (ancho indicado = ancho impreso). <b>Toca el nombre de cualquier archivo para ir a ese logo.</b> <b>Medidas y ubicaciones referenciales: confirmar con el proveedor antes de imprimir.</b></div>

<h3>Resumen por modelo</h3>${resumen}
<h3>Total por color y talla</h3>${porColor}
<h3>Etiquetas de cuello (${ETIQUETA.ancho} × ${ETIQUETA.alto} cm · ${ETIQUETA.ubicacion})</h3>${tablaEt}
<div class="etq">${Object.keys(etiquetas).map((k) => TALLAS.map((t) => `<div style="background:${E.VERSIONES[k].fondo};border:1px solid #ddd">${E.svg(t, k, { width: 120, height: 80 })}</div>`).join('')).join('')}</div>
<h3 id="archivos">Archivos de logos (carpeta logos/)</h3>${tablaArch}

<div class="page-break"></div>
<h3>Ficha por modelo</h3>${fichas}
${anexo}
</body></html>`;
return html;
}

// logo del encabezado en versión oscura (para papel blanco)
const shop = fs.readFileSync(path.join(WEB, 'assets', 'logos', 'logo-shop.svg'), 'utf8').split('#F2F0E8').join('#1C1D1A');
fs.writeFileSync(path.join(OUT, 'logo-twh.svg'), shop);
fs.writeFileSync(path.join(OUT, 'pedido.html'), construir('html'));
fs.writeFileSync(path.join(OUT, '_pedido-pdf.html'), construir('pdf'));

// ---------- PDF ----------
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
(async () => {
  const browser = await puppeteer.launch({ executablePath: edge, headless: true, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  await page.goto('file:///' + path.join(OUT, '_pedido-pdf.html').replace(/\\/g, '/'), { waitUntil: 'load' });
  await page.pdf({ path: path.join(OUT, 'pedido.pdf'), format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '12mm', right: '12mm' } });

  // logos: un PDF por archivo, página del tamaño exacto del logo (sin fondo: transparente al importarlo)
  for (const a of archivos.values()) {
    const { svg, hcm } = svgLogo(a);
    await page.setContent(`<!doctype html><html><head><style>@page{size:${a.cm}cm ${hcm}cm;margin:0}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${svg}</body></html>`);
    await page.pdf({ path: path.join(OUT, 'logos', a.file), width: `${a.cm}cm`, height: `${hcm}cm`, printBackground: false, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
  }
  // etiquetas: una por versión (color) y talla del pedido
  for (const k of Object.keys(etiquetas)) for (const t of TALLAS) {
    await page.setContent(`<!doctype html><html><head><style>@page{size:${ETIQUETA.ancho}cm ${ETIQUETA.alto}cm;margin:0}html,body{margin:0;background:transparent}svg{display:block}</style></head><body>${E.svg(t, k, { width: ETIQUETA.ancho + 'cm', height: ETIQUETA.alto + 'cm' })}</body></html>`);
    await page.pdf({ path: path.join(OUT, 'etiquetas', `etiqueta-${k}-${t}.pdf`), width: `${ETIQUETA.ancho}cm`, height: `${ETIQUETA.alto}cm`, printBackground: false, margin: { top: 0, bottom: 0, left: 0, right: 0 }, pageRanges: '1' });
  }
  await browser.close();
  fs.unlinkSync(path.join(OUT, '_pedido-pdf.html'));

  // ZIP para mandar al proveedor: documento + logos + etiquetas
  const zip = path.join(OUT, '..', `pedido-TWH-${hoy}.zip`);
  try { fs.unlinkSync(zip); } catch (e) {}
  const items = ['pedido.pdf', 'pedido.html', 'logo-twh.svg', 'logos', 'etiquetas'].map((n) => `'${path.join(OUT, n)}'`).join(',');
  require('child_process').execFileSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path ${items} -DestinationPath '${zip}' -Force`]);
  console.log(`ZIP para el proveedor: ${path.relative(ROOT, zip)}`);
  console.log(`Listo en ${path.relative(ROOT, OUT)}: ${total} poleras, ${archivos.size} logos PDF, ${Object.keys(etiquetas).length * TALLAS.length} etiquetas PDF`);
})().catch((e) => { console.error(e); process.exit(1); });
