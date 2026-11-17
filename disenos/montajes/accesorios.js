// Fotos de producto de polerones y jockeys a partir de "Modelos foto/".
// Uso: node disenos/montajes/accesorios.js
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const BASES = path.join(ROOT, 'Modelos foto');
const LOGOS = path.join(ROOT, 'web', 'assets', 'logos');
const OUT = process.env.TWH_OUT || path.join(ROOT, 'web', 'assets', 'img', 'productos');
fs.mkdirSync(OUT, { recursive: true });
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const svg = (n) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(LOGOS, n + '.svg'), 'utf8'));
const png = (f) => 'data:image/png;base64,' + fs.readFileSync(path.join(BASES, f)).toString('base64');

// ops (en % de la foto):
//  tapar: [x0,y0,x1,y1] rellena con el color de la tela de alrededor
//  oscurecer: true -> pasa la prenda azul marino a negro
//  logo: { src, x, y, w } centro y ancho
//  parche: { x0,y0,x1,y1, src } etiqueta tejida crema con logo oscuro
function pagina(W, H, foto, ops) {
  return `<!doctype html><html><body style="margin:0;overflow:hidden"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const ops = ${JSON.stringify(ops)};
const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
(async () => {
  const c = document.getElementById('c'), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(await load('${foto}'), 0, 0);
  const P = (v, t) => Math.round(v / 100 * t);
  if (ops.oscurecer) {
    const d = x.getImageData(0, 0, ${W}, ${H}), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], g = p[i+1], b = p[i+2], l = 0.299*r + 0.587*g + 0.114*b;
      if (l < 150) { const k = l < 110 ? 1 : (150 - l) / 40; const v = l * 0.62; p[i] = r + (v - r) * k; p[i+1] = g + (v - g) * k; p[i+2] = b + (v * 1.02 - b) * k; }
    }
    x.putImageData(d, 0, 0);
  }
  for (const t of ops.tapar || []) {
    const x0 = P(t[0], ${W}), y0 = P(t[1], ${H}), w = P(t[2] - t[0], ${W}), h = P(t[3] - t[1], ${H});
    const ring = x.getImageData(x0 - 4, y0 - 4, w + 8, h + 8).data;
    let r = 0, g = 0, b = 0, k = 0;
    for (let i = 0; i < ring.length; i += 4) { const l = 0.299*ring[i] + 0.587*ring[i+1] + 0.114*ring[i+2]; if (l < 90) { r += ring[i]; g += ring[i+1]; b += ring[i+2]; k++; } }
    x.fillStyle = 'rgb(' + (r/k|0) + ',' + (g/k|0) + ',' + (b/k|0) + ')';
    x.filter = 'blur(1.5px)'; x.fillRect(x0 - 2, y0 - 2, w + 4, h + 4); x.filter = 'none';
  }
  if (ops.parche) {
    const q = ops.parche, x0 = P(q.x0, ${W}), y0 = P(q.y0, ${H}), w = P(q.x1 - q.x0, ${W}), h = P(q.y1 - q.y0, ${H});
    x.save(); x.shadowColor = 'rgba(0,0,0,.35)'; x.shadowBlur = 3; x.shadowOffsetY = 1;
    x.fillStyle = '#E9E4D6'; x.fillRect(x0, y0, w, h); x.restore();
    x.strokeStyle = 'rgba(60,55,45,.35)'; x.setLineDash([2, 2]); x.strokeRect(x0 + 3, y0 + 3, w - 6, h - 6); x.setLineDash([]);
    const im = await load(q.src), lw = w * 0.82, lh = lw * im.naturalHeight / im.naturalWidth;
    x.drawImage(im, x0 + (w - lw) / 2, y0 + (h - lh) / 2, lw, lh);
  }
  if (ops.logo) {
    const im = await load(ops.logo.src), w = ops.logo.w / 100 * ${W}, h = w * im.naturalHeight / im.naturalWidth;
    x.globalAlpha = 0.93; x.drawImage(im, ops.logo.x / 100 * ${W} - w / 2, ops.logo.y / 100 * ${H} - h / 2, w, h); x.globalAlpha = 1;
  }
  document.title = 'listo';
})();
<\/script></body></html>`;
}

function render(file, size, ops, out) {
  const tmp = path.join(__dirname, '_tmp-acc.html');
  fs.writeFileSync(tmp, pagina(size[0], size[1], png(file), ops));
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000',
    `--window-size=${size[0]},${size[1]}`, '--screenshot=' + path.join(OUT, out), 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
  console.log('ok', out);
}

module.exports = { render };
if (require.main === module) {
const FRENTE = ['poleron-negro-frente.png', [600, 574]];
const ESPALDA = ['poleron-negro-espalda.png', [415, 606]];
const TAG = [66, 91.5, 69.5, 97]; // etiqueta de la marca original en el ruedo

// Polerones básicos: logo chico en el pecho (lado del corazón) y espalda lisa
const BASICOS = { 'poleron-basico-twh': 'logo-header', 'poleron-basico-sello': 'round-stamp', 'poleron-basico-cl-shop': 'cl-shop' };
for (const [id, logo] of Object.entries(BASICOS)) {
  render(FRENTE[0], FRENTE[1], { tapar: [TAG], logo: { src: svg(logo), x: 59, y: 33, w: logo === 'logo-header' ? 12 : 11 } }, `${id}-frente.png`);
  render(ESPALDA[0], ESPALDA[1], {}, `${id}-espalda.png`);
}
// Jockeys negros (5 paneles): logos chicos en el panel frontal
const CAP = 'jockey-5-paneles-azul.png', CS = [520, 420];
const JOCKEYS = {
  'jockey-twh': { parche: { x0: 36, y0: 43.5, x1: 46, y1: 54, src: svg('logo-header-claro') } },
  'jockey-cl-shop': { parche: { x0: 36, y0: 42.5, x1: 46, y1: 55, src: svg('cl-shop-claro') } },
  'jockey-sello': { logo: { src: svg('round-stamp'), x: 41, y: 48.5, w: 10 } },
  'jockey-speed-shop': { logo: { src: svg('speed-shop'), x: 41, y: 48.5, w: 10.5 } },
  'jockey-diff-lock': { logo: { src: svg('diff-lock'), x: 41, y: 48.5, w: 10 } }
};
for (const [id, op] of Object.entries(JOCKEYS)) render(CAP, CS, { oscurecer: true, tapar: [[33.5, 40.5, 48.2, 57.2]], ...op }, id + '.png');
}
