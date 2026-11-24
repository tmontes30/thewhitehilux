// Pasa lo creado en el configurador a la tienda.
//  - Modo "agregar" (el que exporta el configurador desde 2026-11-24): genera las fotos y SUMA los productos nuevos
//    al catálogo como Próximamente (los stickers se suman como diseño nuevo del sticker). No toca nada de lo que ya existe.
//  - Modo antiguo "reemplazar" (archivo sin modo): reemplaza todas las poleras, polerones y jockeys. Solo con --reemplazar.
// Uso: node disenos/configurador/aplicar.js [ruta/a/twh-coleccion.json] [--reemplazar]
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const P = require('./posiciones.js');

const HERE = __dirname;
const ROOT = path.join(HERE, '..', '..');
const LOGOS = path.join(ROOT, 'web', 'assets', 'logos');
const OUT = path.join(ROOT, 'web', 'assets', 'img', 'productos');
const CATALOG = path.join(ROOT, 'web', 'data', 'catalog.js');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));

const file = process.argv.slice(2).find((a) => !a.startsWith('--')) || path.join(HERE, 'twh-coleccion.json');
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
const AGREGAR = raw.modo === 'agregar';
if (!AGREGAR && !process.argv.includes('--reemplazar')) {
  console.error('Este archivo es del configurador antiguo (reemplaza TODA la colección de la tienda). No se aplicó nada.\n' +
    'Exporta de nuevo desde el configurador nuevo, o si de verdad quieres reemplazar todo: node aplicar.js <archivo> --reemplazar');
  process.exit(1);
}
const todos = raw.productos || raw;
const stickers = todos.filter((d) => d.tipo === 'sticker');
const items = todos.filter((d) => d.tipo !== 'sticker');
global.window = {}; require('./datos.js'); const LMETA = {}; window.TWH_CFG.logos.forEach((l) => { LMETA[l.id] = l; });

// ---------- ids únicos a partir del nombre ----------
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
// Si la prenda ya existe en la tienda (el configurador guarda su id), se conserva el id aunque cambie el nombre:
// así no pierde su stock, precio, estado ni ventas en el panel. Las prendas nuevas reciben un id a partir del nombre.
const current = new Map(require(CATALOG).products.map((p) => [p.id, p.type]));
// al agregar, los ids nuevos no pueden chocar con ningún producto de la tienda
const used = new Set(AGREGAR ? current.keys() : []);
if (!AGREGAR) items.forEach((d) => { if (d.id && current.get(d.id) === d.tipo && !used.has(d.id)) { used.add(d.id); d._id = d.id; } });
items.forEach((d) => {
  if (d._id) return;
  let id = slug(d.nombre || d.tipo) || d.tipo, k = 2;
  while (used.has(id)) id = (slug(d.nombre) || d.tipo) + '-' + k++;
  used.add(id); d._id = id;
});

// ---------- fotos ----------
const dataUri = (p, mime) => `data:${mime};base64,` + fs.readFileSync(p).toString('base64');
function renderView(d, viewKey, outFile) {
  const V = P.VIEWS[viewKey], [W, H] = V.size;
  const layers = P.placementsFor(d, viewKey).filter((p) => LMETA[p.logo]).map((p) => {
    const r = P.rect(LMETA[p.logo], viewKey, p);
    return { r, parche: !!p.parche, src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(fs.readFileSync(path.join(LOGOS, p.logo + (p.claro ? '-claro' : '') + '.svg'), 'utf8')) };
  });
  const html = `<!doctype html><body style="margin:0;overflow:hidden"><canvas id="c" width="${W}" height="${H}"></canvas><script>
const L = ${JSON.stringify(layers)}, W = ${W}, H = ${H};
const load = (s) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = s; });
(async () => {
  const x = document.getElementById('c').getContext('2d');
  x.drawImage(await load(${JSON.stringify(dataUri(path.join(HERE, 'bases', V.img), 'image/png'))}), 0, 0);
  for (const l of L) {
    const r = l.r;
    if (l.parche) {
      const pad = r.cWidth * 0.2;
      const px = (r.cLeft - pad) / 100 * W, py = (r.cTop / 100 * H) - pad / 100 * W, pw = (r.cWidth + 2 * pad) / 100 * W, ph = r.cHeight / 100 * H + 2 * pad / 100 * W;
      x.save(); x.shadowColor = 'rgba(0,0,0,.4)'; x.shadowBlur = 3; x.shadowOffsetY = 1; x.fillStyle = '#E9E4D6'; x.fillRect(px, py, pw, ph); x.restore();
      x.strokeStyle = 'rgba(60,55,45,.4)'; x.setLineDash([2, 2]); x.strokeRect(px + 3, py + 3, pw - 6, ph - 6); x.setLineDash([]);
    }
    x.globalAlpha = 0.93;
    x.drawImage(await load(l.src), r.left / 100 * W, r.top / 100 * H, r.width / 100 * W, r.height / 100 * H);
    x.globalAlpha = 1;
  }
  document.title = 'listo';
})();
<\/script></body>`;
  const tmp = path.join(HERE, '_tmp-aplicar.html');
  fs.writeFileSync(tmp, html);
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--virtual-time-budget=5000', `--window-size=${W},${H}`,
    '--screenshot=' + path.join(OUT, outFile), 'file:///' + tmp.replace(/\\/g, '/')], { stdio: 'ignore' });
  fs.unlinkSync(tmp);
}

const nameOf = (id) => (LMETA[id] ? LMETA[id].name : id);
const q = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const arr = (a) => '[' + a.map(q).join(', ') + ']';
// Diseño completo tal como se armó en el configurador (logos, tamaños, posición, altura, estilo del jockey).
// Se guarda en el catálogo para que "Volver a la tienda actual" lo recupere exacto (preparar.js lo usa).
const cfgOf = (d) => {
  const o = { tipo: d.tipo, nombre: d.nombre, colores: d.colores };
  if (d.tipo === 'jockey') o.jockey = d.jockey;
  else { o.frente = d.frente || null; o.espalda = d.espalda || null; o.etiqueta = d.etiqueta !== false; }
  return o;
};
const entries = [];
const keep = new Set();

for (const d of items) {
  const colores = d.tipo === 'polera' ? (d.colores && d.colores.length ? d.colores : ['negro']) : ['negro'];
  const byColor = {};
  for (const c of colores) {
    byColor[c] = P.viewsFor(d, c).map((v) => {
      const kind = v.replace(/^(polera|poleron)-(negro|blanco)-/, '').replace('jockey-negro', 'jockey');
      const out = `${d._id}-${c}-${kind}.png`;
      renderView(d, v, out); keep.add(out);
      return 'assets/img/productos/' + out;
    });
  }
  console.log('ok', d._id);

  let views, desc, features, sizes = ['S', 'M', 'L', 'XL', 'XXL'], guide = q(d.tipo);
  if (d.tipo === 'jockey') {
    views = `[{ shape: 'cap', logo: ${q(d.jockey.logo)} }]`;
    desc = `Jockey negro de 5 paneles con ${nameOf(d.jockey.logo)} ${d.jockey.estilo === 'parche' ? 'en parche tejido' : 'bordado'} al frente. Cierre ajustable.`;
    features = `[['Material', 'Gabardina de algodón'], ['Paneles', '5'], ['Logo', ${q(d.jockey.estilo === 'parche' ? 'Parche tejido' : 'Bordado')}], ['Cierre', 'Ajustable'], ['Talla', 'Única']]`;
    sizes = ['Única']; guide = 'null';
  } else {
    const fr = d.frente ? `{ shape: '${d.tipo === 'polera' ? 'tee-front' : 'hoodie-front'}', logo: ${q(d.frente.logo)} }` : null;
    const bk = d.espalda ? `{ shape: '${d.tipo === 'polera' ? 'tee-back' : 'hoodie-back'}', logo: ${q(d.espalda.logo)} }` : null;
    views = '[' + [bk, fr].filter(Boolean).join(', ') + ']';
    const partes = [];
    if (d.espalda) partes.push(`${nameOf(d.espalda.logo)} en la espalda`);
    if (d.frente) partes.push(`${nameOf(d.frente.logo)} ${d.frente.pos === 'centro' ? 'al centro del pecho' : 'chico en el pecho'}`);
    desc = `${d.tipo === 'polera' ? 'Polera' : 'Polerón con capucha'} con ${partes.join(' y ') || 'diseño TWH'}.`;
    const est = d.espalda && d.frente ? 'DTF espalda y pecho' : d.espalda ? 'DTF espalda' : 'DTF pecho';
    // Etiqueta de cuello estampada (logo + talla): la llevan salvo que se desmarque en el configurador
    const et = d.etiqueta !== false ? `, ['Etiqueta', 'Estampada en el cuello (logo + talla, sin roce)']` : '';
    features = d.tipo === 'polera'
      ? `[['Material', 'Work Gear, tela gruesa de calidad'], ['Modelo', 'Mide 1,74 m, pesa 76 kg y usa talla XL'], ['Estampado', ${q(est)}]${et}]`
      : `[['Material', 'Algodón/poliéster 320 g, perchado'], ['Bolsillo', 'Canguro'], ['Estampado', ${q(est)}]${et}]`;
  }
  entries.push(`      {
        id: ${q(d._id)}, name: ${q(d.nombre)}, type: ${q(d.tipo)}, price: ${P.PRICES[d.tipo]},
        sizes: ${arr(sizes)}, colors: ${arr(colores)},
        views: ${views},
        images: [], imagesByColor: { ${Object.entries(byColor).map(([c, l]) => c + ': ' + arr(l)).join(', ')} }, sizeGuide: ${guide}, active: true,
        desc: ${q(desc)},
        features: ${features},
        cfg: ${JSON.stringify(cfgOf(d))}${AGREGAR ? `,
        status: 'proximamente'` : ''}
      },
`);
}

let cat = fs.readFileSync(CATALOG, 'utf8');
const a = cat.indexOf('    products: [\n'), b = cat.indexOf("      {\n        id: 'sticker-twh'");
if (a < 0 || b < 0) throw new Error('No encontré la lista de productos en catalog.js');
const order = { polera: 0, poleron: 1, jockey: 2 };
const sorted = entries.map((e, i) => [order[items[i].tipo], i, e]).sort((x, y) => x[0] - y[0] || x[1] - y[1]).map((x) => x[2]);

if (AGREGAR) {
  // ---------- agregar: los nuevos van al final de la ropa (antes del sticker); lo que ya existe no se toca ----------
  cat = cat.slice(0, b) + sorted.join('') + cat.slice(b);
  // stickers: diseño nuevo dentro del producto sticker (si ese logo no estaba)
  const lista = () => { const s0 = cat.indexOf("id: 'sticker-twh'"), d0 = cat.indexOf('designs: [', s0); return [d0, cat.indexOf('\n        ],', d0)]; };
  let nuevos = 0;
  for (const st of stickers) {
    if (!st.logo || !LMETA[st.logo]) continue;
    const [d0, d1] = lista();
    if (cat.slice(d0, d1).includes(`id: ${q(st.logo)}`)) continue;
    const nombre = String(st.nombre || '').replace(/^Sticker\s+/i, '') || nameOf(st.logo);
    cat = cat.slice(0, d1) + `,\n          { id: ${q(st.logo)}, name: ${q(nombre)} }` + cat.slice(d1);
    nuevos++;
  }
  // "N a elección" en las características del sticker
  const [d0, d1] = lista();
  const total = (cat.slice(d0, d1).match(/\{ id: /g) || []).length;
  cat = cat.replace(/\['Diseños', '\d+ a elección'\]/, `['Diseños', '${total} a elección']`);
  fs.writeFileSync(CATALOG, cat);
  console.log(`Listo: ${items.length} productos nuevos agregados como Próximamente (${keep.size} fotos) y ${nuevos} diseños de sticker nuevos. Lo que ya estaba en la tienda no se tocó.`);
} else {
  // ---------- reemplazar (modo antiguo, solo con --reemplazar): poleras, polerones y jockeys = la colección ----------
  cat = cat.slice(0, a + '    products: [\n'.length) + sorted.join('') + cat.slice(b);
  fs.writeFileSync(CATALOG, cat);
  let removed = 0;
  for (const f of fs.readdirSync(OUT)) if (f.endsWith('.png') && !keep.has(f)) { fs.unlinkSync(path.join(OUT, f)); removed++; }
  console.log(`Listo: ${items.length} productos en la tienda, ${keep.size} fotos generadas, ${removed} fotos viejas borradas.`);
}
