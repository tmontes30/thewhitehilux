// Fotos de producto con modelo: borra el estampado de la foto base y pone los logos TWH.
// Bases en "Modelos foto/". Salida en web/assets/img/productos/<producto>-<vista>.png
// Uso: node disenos/montajes/modelos.js              -> todas
//      node disenos/montajes/modelos.js polera-rally  -> solo las que empiezan así
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BASES = path.join(ROOT, 'Modelos foto');
const LOGOS = path.join(ROOT, 'web', 'assets', 'logos');
const OUT = process.env.TWH_OUT || path.join(ROOT, 'web', 'assets', 'img', 'productos');
fs.mkdirSync(OUT, { recursive: true });

// Fotos base: zona a borrar (estampado original) y dónde va cada logo, en % de la foto
const BASE = {
  frente1: { file: 'modelo-frente-1.png', size: [528, 639], borrar: [33, 17.5, 62.5, 24.5], pecho: { x: 63.5, y: 25, w: 15 } },
  frente2: { file: 'modelo-frente-2.png', size: [535, 607], borrar: [35.5, 18.5, 62.5, 25.5], pecho: { x: 64.5, y: 26.5, w: 14.5 } },
  espalda: { file: 'modelo-espalda.png', size: [594, 651], borrar: null, espalda: { x: 51.8, y: 30, w: 34 } },
  // polera blanca
  frente1b: { file: 'modelo-blanca-frente-1.png', size: [610, 535], borrar: [33, 22, 58, 51], pecho: { x: 62, y: 31, w: 13 } },
  frente2b: { file: 'modelo-blanca-frente-2.png', size: [454, 601], borrar: [52, 17, 77, 39], pecho: { x: 64, y: 25, w: 16 } },
  espaldab: { file: 'modelo-blanca-espalda.png', size: [555, 628], borrar: null, espalda: { x: 46.8, y: 28, w: 34 } }
};

// Productos: logo de pecho y, si tiene, diseño de espalda (archivos de web/assets/logos sin .svg)
const POLERAS = {
  'polera-rally-team': { pecho: 'logo-header', espalda: 'rally-stripes' },
  'polera-mud-terrain': { pecho: 'logo-header', espalda: 'mud-terrain' },
  'polera-low-range': { pecho: 'logo-header', espalda: 'low-range' },
  'polera-speed-shop': { pecho: 'logo-header', espalda: 'speed-shop' },
  'polera-aired-down': { pecho: 'cl-shop', espalda: 'aired-down' },
  'polera-basica-twh': { pecho: 'logo-header' },
  'polera-basica-sello': { pecho: 'round-stamp' },
  'polera-basica-cl-shop': { pecho: 'cl-shop' }
};

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

function pagina(W, H, foto, borrar, logo) {
  return `<!doctype html><html><body style="margin:0;overflow:hidden;background:#fff"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const borrar = ${JSON.stringify(borrar)}, logo = ${JSON.stringify(logo)};
const img = new Image();
img.onload = async () => {
  const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  if (borrar) {
    const bx = Math.round(borrar[0] / 100 * ${W}), by = Math.round(borrar[1] / 100 * ${H});
    const bw = Math.round((borrar[2] - borrar[0]) / 100 * ${W}), bh = Math.round((borrar[3] - borrar[1]) / 100 * ${H});
    const d = x.getImageData(bx, by, bw, bh), p = d.data, n = bw * bh;
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.299 * p[i*4] + 0.587 * p[i*4+1] + 0.114 * p[i*4+2];
    // color de la tela = mediana del borde de la zona (siempre es tela, sirve en negra y blanca)
    const br = [], bg = [], bb = [];
    for (let xx = 0; xx < bw; xx++) for (const yy of [0, 1, bh - 2, bh - 1]) { const i = yy * bw + xx; br.push(p[i*4]); bg.push(p[i*4+1]); bb.push(p[i*4+2]); }
    for (let yy = 0; yy < bh; yy++) for (const xx of [0, 1, bw - 2, bw - 1]) { const i = yy * bw + xx; br.push(p[i*4]); bg.push(p[i*4+1]); bb.push(p[i*4+2]); }
    const med = (v) => v.sort((m, q) => m - q)[Math.floor(v.length / 2)];
    let r0 = med(br), g0 = med(bg), b0 = med(bb);

    const lim = (0.299 * r0 + 0.587 * g0 + 0.114 * b0) > 170 ? 12 : 30; // tela clara: más sensible
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const dr = p[i*4]-r0, dg = p[i*4+1]-g0, db = p[i*4+2]-b0; if (Math.sqrt(dr*dr+dg*dg+db*db) > lim) mask[i] = 1; }
    for (let pass = 0; pass < 3; pass++) { const m2 = mask.slice(); for (let yy = 1; yy < bh-1; yy++) for (let xx = 1; xx < bw-1; xx++) { const i = yy*bw+xx; if (!mask[i] && (mask[i-1]||mask[i+1]||mask[i-bw]||mask[i+bw])) m2[i] = 1; } mask = m2; }
    const R = 10, cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n), cw = new Float32Array(n);
    for (let i = 0; i < n; i++) if (!mask[i]) { cr[i] = p[i*4]; cg[i] = p[i*4+1]; cb[i] = p[i*4+2]; cw[i] = 1; }
    const blur = (a) => { const t = new Float32Array(n), o = new Float32Array(n);
      for (let yy = 0; yy < bh; yy++) { let s = 0; for (let xx = -R; xx < bw; xx++) { if (xx+R < bw) s += a[yy*bw+xx+R]; if (xx-R-1 >= 0) s -= a[yy*bw+xx-R-1]; if (xx >= 0) t[yy*bw+xx] = s; } }
      for (let xx = 0; xx < bw; xx++) { let s = 0; for (let yy = -R; yy < bh; yy++) { if (yy+R < bh) s += t[(yy+R)*bw+xx]; if (yy-R-1 >= 0) s -= t[(yy-R-1)*bw+xx]; if (yy >= 0) o[yy*bw+xx] = s; } }
      return o; };
    const BR = blur(cr), BG = blur(cg), BB = blur(cb), BW = blur(cw);
    for (let i = 0; i < n; i++) if (mask[i]) { const w = BW[i], nz = (Math.random() - .5) * 4;
      p[i*4] = (w > .5 ? BR[i]/w : r0) + nz; p[i*4+1] = (w > .5 ? BG[i]/w : g0) + nz; p[i*4+2] = (w > .5 ? BB[i]/w : b0) + nz; }
    x.putImageData(d, bx, by);
  }
  if (logo) {
    const im = new Image(); im.src = logo.src; await im.decode();
    const w = logo.w / 100 * ${W}, h = w * im.naturalHeight / im.naturalWidth;
    x.save(); x.translate(logo.x / 100 * ${W}, logo.y / 100 * ${H}); x.globalAlpha = 0.93;
    // centrar según lo dibujado (no según el cuadro del logo)
    const oc = document.createElement('canvas'); oc.width = Math.ceil(w); oc.height = Math.ceil(h);
    const ox = oc.getContext('2d'); ox.drawImage(im, 0, 0, w, h);
    const ad = ox.getImageData(0, 0, oc.width, oc.height).data; let L = oc.width, R = 0;
    for (let yy = 0; yy < oc.height; yy++) for (let xx = 0; xx < oc.width; xx++) if (ad[(yy * oc.width + xx) * 4 + 3] > 20) { if (xx < L) L = xx; if (xx > R) R = xx; }
    const dx = R > L ? w / 2 - (L + R) / 2 : 0;
    x.drawImage(im, -w / 2 + dx, -h / 2, w, h); x.restore();
  }
  document.title = 'listo';
};
img.src = '${foto}';
<\/script></body></html>`;
}

function render(baseKey, logoName, zona, outName) {
  const b = BASE[baseKey];
  const [W, H] = b.size;
  const foto = 'data:image/png;base64,' + fs.readFileSync(path.join(BASES, b.file)).toString('base64');
  const logo = logoName ? { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(LOGOS, logoName + '.svg'), 'utf8')), ...b[zona] } : null;
  const tmp = path.join(__dirname, '_tmp-modelo.html');
  fs.writeFileSync(tmp, pagina(W, H, foto, b.borrar, logo));
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000',
    `--window-size=${W},${H}`, '--screenshot=' + path.join(OUT, outName), 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
}

module.exports = { render, BASE };
if (require.main === module) {
const only = process.argv.slice(2);
for (const [id, cfg] of Object.entries(POLERAS)) {
  if (only.length && !only.some((o) => id.startsWith(o))) continue;
  // negra: logos claros · blanca: versión oscura de cada logo (-claro.svg)
  for (const [sufijo, b, v] of [['', '', ''], ['-blanco', 'b', '-claro']]) {
    if (cfg.espalda) render('espalda' + b, cfg.espalda + v, 'espalda', `${id}${sufijo}-espalda.png`);
    render('frente1' + b, cfg.pecho + v, 'pecho', `${id}${sufijo}-frente.png`);
    render('frente2' + b, cfg.pecho + v, 'pecho', `${id}${sufijo}-frente-2.png`);
  }
  console.log('ok', id);
}
console.log('Fotos en web/assets/img/productos/');
}
