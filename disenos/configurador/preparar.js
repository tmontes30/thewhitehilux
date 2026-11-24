// Prepara el configurador: fotos base limpias + datos.js (logos con su medida real + colección actual).
// Correr de nuevo cuando agregues logos nuevos:  node disenos/configurador/preparar.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
const LOGOS = path.join(ROOT, 'web', 'assets', 'logos');
const BASES_OUT = path.join(HERE, 'bases');
fs.mkdirSync(BASES_OUT, { recursive: true });
process.env.TWH_OUT = BASES_OUT;
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

// ---------- 1. Fotos base limpias ----------
const skipBases = process.argv.includes('--sin-bases');
if (!skipBases) {
  const M = require('../montajes/modelos.js');
  const A = require('../montajes/accesorios.js');
  M.render('frente1', null, 'pecho', 'polera-negro-frente.png');
  M.render('frente2', null, 'pecho', 'polera-negro-frente-2.png');
  M.render('espalda', null, 'espalda', 'polera-negro-espalda.png');
  M.render('frente1b', null, 'pecho', 'polera-blanco-frente.png');
  M.render('frente2b', null, 'pecho', 'polera-blanco-frente-2.png');
  M.render('espaldab', null, 'espalda', 'polera-blanco-espalda.png');
  A.render('poleron-negro-frente.png', [600, 574], { tapar: [[66, 91.5, 69.5, 97]] }, 'poleron-negro-frente.png');
  A.render('poleron-negro-espalda.png', [415, 606], {}, 'poleron-negro-espalda.png');
  A.render('jockey-5-paneles-azul.png', [520, 420], { oscurecer: true, tapar: [[33.5, 40.5, 48.2, 57.2]] }, 'jockey-negro.png');
}

// ---------- 2. Medida real de cada logo (caja de lo dibujado) ----------
const NAMES = {
  'race-dept': '4WD Race Dept.', 'logo-header': 'TWH franjas', 'logo-shop': 'The White Hilux (horizontal)', 'cl-shop': 'The White Hilux CL Shop',
  'rally-stripes': 'Rally Team', 'twh-4x4': 'TWH 4X4', 'diff-lock': 'Rear Diff Lock', 'mud-terrain': 'Mud Terrain', 'aired-down': 'Aired Down',
  'checkered-shield': 'Escudo 4x4 Team', 'low-range': 'Low Range Club', 'recovery-crew': 'Recovery Crew', 'road-sign': 'Off Road Recovery',
  'sunset': 'Sunset', 'patente': 'Patente TWH·4X4', 'rally-plate': 'Placa Rally 01', 'off-road-script': 'Off Road (manuscrita)',
  'coordenadas': 'Off Road Team', 'supply-co': 'TWH Supply Co.', 'iron-cross': 'Cruz Chopper', 'warp-text': 'Warp',
  'mountain-patch': 'Race Shop', 'script-checker': 'White Hilux Script', 'tire-blueprint': 'Plano 35"', 'round-stamp': 'Sello Off Road Supply',
  'speed-shop': 'Speed Shop', 'tall-stack': 'Off Road Dept.', 'sunburst': 'Sunburst',
  'race-dept-ops': '4WD Race Dept. (oficial)', 'topo-explorers': 'Off Road Explorers (topo)', 'rally-raid': 'Rally Raid 4X4',
  'stay-dirty': 'Stay Dirty', 'winch-crew': 'Winch Crew'
};
const ids = fs.readdirSync(LOGOS).filter((f) => f.endsWith('.svg') && !f.endsWith('-claro.svg') && f !== 'logo-oficial.svg' && !f.startsWith('favicon')).map((f) => f.replace('.svg', ''));
const srcs = ids.map((id) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(LOGOS, id + '.svg'), 'utf8')));
const tmp = path.join(HERE, '_medir.html');
fs.writeFileSync(tmp, `<!doctype html><body><pre id="o"></pre><script>
const ids = ${JSON.stringify(ids)}, srcs = ${JSON.stringify(srcs)};
(async () => {
  const out = {};
  for (let k = 0; k < ids.length; k++) {
    const im = new Image(); im.src = srcs[k]; await im.decode();
    const W = 600, H = Math.round(600 * im.naturalHeight / im.naturalWidth);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d'); x.drawImage(im, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data; let L = W, R = 0, T = H, B = 0;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) if (d[(y * W + xx) * 4 + 3] > 20) { if (xx < L) L = xx; if (xx > R) R = xx; if (y < T) T = y; if (y > B) B = y; }
    out[ids[k]] = { aspect: +(H / W).toFixed(4), l: +(L / W).toFixed(4), r: +((R + 1) / W).toFixed(4), t: +(T / H).toFixed(4), b: +((B + 1) / H).toFixed(4) };
  }
  document.getElementById('o').textContent = JSON.stringify(out);
})();
<\/script></body>`);
const dom = execFileSync(edge, ['--headless=new', '--disable-gpu', '--virtual-time-budget=20000', '--dump-dom', 'file:///' + tmp.replace(/\\/g, '/')], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
fs.unlinkSync(tmp);
const box = JSON.parse(dom.match(/<pre id="o">([^<]*)<\/pre>/)[1].replace(/&quot;/g, '"'));
const logos = ids.map((id) => ({ id, name: NAMES[id] || id, ...box[id] })).sort((a, b) => a.name.localeCompare(b.name));

// ---------- 3. Colección actual (punto de partida) ----------
const { products } = require('../../web/data/catalog.js');
const backOf = (p, shape) => (p.views.find((v) => v.shape === shape) || {}).logo || null;
const seed = products.filter((p) => ['polera', 'poleron', 'jockey'].includes(p.type)).map((p) => {
  // Si aplicar.js guardó el diseño completo (cfg), se usa tal cual: tamaños, posición, altura y estilo exactos
  if (p.cfg) return JSON.parse(JSON.stringify({ id: p.id, ...p.cfg, tipo: p.type, nombre: p.name, colores: p.colors.slice() }));
  // Productos antiguos sin cfg: se reconstruye lo que se puede desde las vistas (tamaño medio por defecto)
  const d = { id: p.id, tipo: p.type, nombre: p.name, colores: p.colors.slice() };
  if (p.type === 'jockey') {
    const parche = /Parche/i.test(p.name);
    d.jockey = { logo: p.views[0].logo, estilo: parche ? 'parche' : 'bordado', tam: 'm' };
  } else {
    const f = backOf(p, p.type === 'polera' ? 'tee-front' : 'hoodie-front') || backOf(p, 'tee-front-big');
    const b = backOf(p, p.type === 'polera' ? 'tee-back' : 'hoodie-back');
    d.frente = f ? { logo: f, pos: 'pecho', tam: 'm' } : null;
    d.espalda = b ? { logo: b, tam: 'm', alto: 0 } : null;
  }
  return d;
});

fs.writeFileSync(path.join(HERE, 'datos.js'), '// Generado por preparar.js\nwindow.TWH_CFG = ' + JSON.stringify({ logos, seed }, null, 1) + ';\n');
console.log('Listo:', logos.length, 'logos,', seed.length, 'productos en la colección inicial');
