// Montajes publicitarios: borra el estampado anterior de la polera píxel a píxel (sin parches)
// y pone encima el logo TWH centrado donde estaba el estampado.
// Uso: node disenos/montajes/montar.js          -> todas
//      node disenos/montajes/montar.js 11 16    -> solo esas fotos
// Cada item: box = zona del estampado (en % de la foto, ajustada a la polera), logo, giro, escala.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const SRC = path.join(ROOT, 'fotos-originales');
const LOGOS = path.join(ROOT, 'web', 'assets', 'logos');
const OUT = path.join(ROOT, 'web', 'assets', 'img', 'fotos');
fs.mkdirSync(OUT, { recursive: true });

const MONTAJES = {
  11: { size: [841, 817], items: [{ box: [34, 26, 66, 61], rot: 0, logo: 'rally-stripes', escala: 1.3 }] },
  12: { size: [784, 757], items: [{ box: [27, 29, 45.5, 50.5], rot: 0, logo: 'mud-terrain', escala: 1.3 }] },
  13: { size: [942, 820], items: [{ box: [29, 14, 82, 83], rot: 3, logo: 'low-range', escala: 1.15 }] },
  16: { size: [897, 669], items: [
    { box: [23.5, 28.2, 31.7, 42.8], rot: 0, logo: 'rally-stripes', escala: 1.2, ajustada: true },
    { box: [51, 24, 63, 41], rot: 0, logo: 'race-dept', escala: 1.3 },
    { box: [69, 25, 80, 41.5], rot: 0, logo: 'low-range', escala: 1.3 }] },
  14: { size: [1476, 814], items: [
    { box: [42.5, 39.5, 52.5, 58.5], rot: 0, logo: 'speed-shop', escala: 1.25 },
    { box: [73.2, 46.5, 78.3, 52.5], rot: 0, logo: 'logo-header', escala: 1.0, ancho: true }] },
  18: { size: [766, 736], items: [{ box: [49, 24.5, 62, 35], rot: 0, logo: 'logo-header', escala: 0.95, ancho: true }] }
};

const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
const only = process.argv.slice(2);

// Código que corre en el navegador: limpia el estampado y dibuja el logo
function pagina(W, H, foto, items) {
  return `<!doctype html><html><body style="margin:0;overflow:hidden;background:#000"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const items = ${JSON.stringify(items)};
const img = new Image();
img.onload = async () => {
  const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0);
  for (const it of items) {
    const bx = Math.round(it.box[0] / 100 * ${W}), by = Math.round(it.box[1] / 100 * ${H});
    const bw = Math.round((it.box[2] - it.box[0]) / 100 * ${W}), bh = Math.round((it.box[3] - it.box[1]) / 100 * ${H});
    const d = x.getImageData(bx, by, bw, bh), p = d.data, n = bw * bh;
    // color de la tela: mediana de los píxeles oscuros de la zona
    const lum = new Float32Array(n);
    for (let i = 0; i < n; i++) lum[i] = 0.299 * p[i*4] + 0.587 * p[i*4+1] + 0.114 * p[i*4+2];
    const sorted = Array.from(lum).sort((a, b) => a - b);
    const base = sorted[Math.floor(n * 0.3)];
    let r0 = 0, g0 = 0, b0 = 0, k0 = 0;
    for (let i = 0; i < n; i++) if (lum[i] <= base + 8) { r0 += p[i*4]; g0 += p[i*4+1]; b0 += p[i*4+2]; k0++; }
    r0 /= k0; g0 /= k0; b0 /= k0;
    // máscara: lo que se aleja del color de la tela (estampado blanco o rojo)
    let mask = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const dr = p[i*4] - r0, dg = p[i*4+1] - g0, db = p[i*4+2] - b0;
      if (Math.sqrt(dr*dr + dg*dg + db*db) > 48) mask[i] = 1;
    }
    // descartar lo que toca el borde de la zona: es fondo, no estampado
    if (!it.ajustada) {
      const q = [];
      for (let xx = 0; xx < bw; xx++) { q.push(xx, (bh - 1) * bw + xx); }
      for (let yy = 0; yy < bh; yy++) { q.push(yy * bw, yy * bw + bw - 1); }
      while (q.length) {
        const i = q.pop();
        if (!mask[i]) continue;
        mask[i] = 0;
        const xx = i % bw, yy = (i - xx) / bw;
        if (xx > 0) q.push(i - 1); if (xx < bw - 1) q.push(i + 1); if (yy > 0) q.push(i - bw); if (yy < bh - 1) q.push(i + bw);
      }
    }
    // ensanchar la máscara para tomar los bordes suaves del estampado
    for (let pass = 0; pass < 3; pass++) {
      const m2 = mask.slice();
      for (let yy = 1; yy < bh - 1; yy++) for (let xx = 1; xx < bw - 1; xx++) {
        const i = yy * bw + xx;
        if (!mask[i] && (mask[i-1] || mask[i+1] || mask[i-bw] || mask[i+bw])) m2[i] = 1;
      }
      mask = m2;
    }
    // centro y tamaño del estampado borrado
    let mx0 = bw, my0 = bh, mx1 = 0, my1 = 0, cnt = 0, sx = 0, sy = 0;
    for (let yy = 0; yy < bh; yy++) for (let xx = 0; xx < bw; xx++) if (mask[yy*bw+xx]) {
      cnt++; sx += xx; sy += yy; if (xx < mx0) mx0 = xx; if (yy < my0) my0 = yy; if (xx > mx1) mx1 = xx; if (yy > my1) my1 = yy;
    }
    // relleno: promedio difuso de la tela alrededor (conserva la sombra de la polera)
    const R = 14, acc = new Float32Array(n * 4);
    const cr = new Float32Array(n), cg = new Float32Array(n), cb = new Float32Array(n), cw = new Float32Array(n);
    for (let i = 0; i < n; i++) if (!mask[i]) { cr[i] = p[i*4]; cg[i] = p[i*4+1]; cb[i] = p[i*4+2]; cw[i] = 1; }
    const blur = (a) => {
      const t = new Float32Array(n), o = new Float32Array(n);
      for (let yy = 0; yy < bh; yy++) { let s = 0; for (let xx = -R; xx < bw; xx++) { if (xx + R < bw) s += a[yy*bw + xx + R]; if (xx - R - 1 >= 0) s -= a[yy*bw + xx - R - 1]; if (xx >= 0) t[yy*bw+xx] = s; } }
      for (let xx = 0; xx < bw; xx++) { let s = 0; for (let yy = -R; yy < bh; yy++) { if (yy + R < bh) s += t[(yy+R)*bw + xx]; if (yy - R - 1 >= 0) s -= t[(yy-R-1)*bw + xx]; if (yy >= 0) o[yy*bw+xx] = s; } }
      return o;
    };
    let BR = blur(cr), BG = blur(cg), BB = blur(cb), BW = blur(cw);
    for (let i = 0; i < n; i++) if (mask[i]) {
      const w = BW[i];
      const noise = (Math.random() - 0.5) * 6;
      p[i*4]   = (w > 0.5 ? BR[i] / w : r0) + noise;
      p[i*4+1] = (w > 0.5 ? BG[i] / w : g0) + noise;
      p[i*4+2] = (w > 0.5 ? BB[i] / w : b0) + noise;
    }
    x.putImageData(d, bx, by);
    // logo centrado sobre el estampado borrado
    if (it.logo && cnt) {
      const logo = new Image(); logo.src = it.logo; await logo.decode();
      const cx = bx + (mx0 + mx1) / 2, cy = by + (my0 + my1) / 2;
      const size = (it.ancho ? (mx1 - mx0) : Math.max(mx1 - mx0, my1 - my0)) * (it.escala || 1.2);
      x.save(); x.translate(cx, cy); x.rotate(it.rot * Math.PI / 180); x.globalAlpha = 0.94;
      x.drawImage(logo, -size / 2, -size / 2, size, size); x.restore();
    }
  }
  document.title = 'listo';
};
img.src = '${foto}';
<\/script></body></html>`;
}

for (const [id, m] of Object.entries(MONTAJES)) {
  if (only.length && !only.includes(id)) continue;
  const [W, H] = m.size;
  const foto = 'data:image/png;base64,' + fs.readFileSync(path.join(SRC, `foto-${id}.png`)).toString('base64');
  const items = m.items.map((it) => ({ ...it, logo: it.logo ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(LOGOS, it.logo + '.svg'), 'utf8')) : null }));
  const tmp = path.join(__dirname, `_tmp-${id}.html`);
  fs.writeFileSync(tmp, pagina(W, H, foto, items));
  execFileSync(edge, ['--headless=new', '--edge-skip-compat-layer-relaunch', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=6000',
    `--window-size=${W},${H}`, '--screenshot=' + path.join(OUT, `foto-${id}.png`), 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  console.log('ok foto', id);
}
console.log('Fotos listas en web/assets/img/fotos/');
