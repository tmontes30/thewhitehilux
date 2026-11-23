// Pasa un SVG a "contornos" para imprenta: sin textos ni bordes (strokes), solo figuras rellenas.
//  1) Cada <text> se reemplaza por las figuras de sus letras. La posición de cada letra la da el navegador
//     (respeta letter-spacing, text-anchor, textLength y textPath) y la forma sale de la tipografía real
//     (fontkit, con variaciones: Bahnschrift en negrita condensada).
//  2) Cada borde (stroke) se convierte en una figura rellena del mismo color (paper.js + paperjs-offset).
//     En textos con paint-order="stroke" (borde por detrás) los bordes de todas las letras se unen y quedan atrás.
// Uso: const { contornos } = require('./contornos'); const svgOk = await contornos(page, svg)  (page = puppeteer)
const path = require('path');
const fontkit = require('fontkit');

const NM = path.join(__dirname, '..', 'node_modules');
const WINF = 'C:/Windows/Fonts/';
const FUENTES = path.join(__dirname, '..', 'fuentes');
// familia (minúsculas) → archivo según peso
const FAMILIAS = {
  'impact': () => WINF + 'impact.ttf',
  'arial black': () => WINF + 'ariblk.ttf',
  'segoe ui black': () => WINF + 'seguibl.ttf',
  'arial': (w) => WINF + (w >= 600 ? 'arialbd.ttf' : 'arial.ttf'),
  'arial narrow': (w) => WINF + (w >= 600 ? 'ARIALNB.TTF' : 'ARIALN.TTF'),
  'bahnschrift': () => WINF + 'bahnschrift.ttf',
  'segoe script': (w) => WINF + (w >= 600 ? 'segoescb.ttf' : 'segoesc.ttf'),
  'segoe ui': (w) => WINF + (w >= 600 ? 'segoeuib.ttf' : 'segoeui.ttf'),
  'segoe ui symbol': () => WINF + 'seguisym.ttf',
  'consolas': () => WINF + 'consola.ttf',
  'black ops one': () => path.join(FUENTES, 'BlackOpsOne-Regular.ttf'),
  'bebas neue': () => path.join(FUENTES, 'BebasNeue-Regular.ttf'),
  'alfa slab one': () => path.join(FUENTES, 'AlfaSlabOne-Regular.ttf'),
  'rye': () => path.join(FUENTES, 'Rye-Regular.ttf'),
  'yellowtail': () => path.join(FUENTES, 'Yellowtail-Regular.ttf'),
};
const cache = {};
function abrir(file) {
  if (!(file in cache)) { try { cache[file] = fontkit.openSync(file); } catch (e) { cache[file] = null; } }
  return cache[file];
}
// Tipografía que usa el navegador: la primera de la lista que esté instalada y tenga la letra
function fuente(familyCss, peso, ancho, ch) {
  const fams = familyCss.split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '').toLowerCase());
  for (const f of fams.concat(['segoe ui symbol'])) {
    const file = FAMILIAS[f] && FAMILIAS[f](peso);
    let font = file && abrir(file);
    if (!font) continue;
    if (ch && !font.hasGlyphForCodePoint(ch.codePointAt(0))) continue;
    if (font.variationAxes && font.variationAxes.wght) {
      const ax = font.variationAxes;
      const v = { wght: Math.min(ax.wght.max, Math.max(ax.wght.min, peso)) };
      if (ax.wdth) v.wdth = Math.min(ax.wdth.max, Math.max(ax.wdth.min, ancho));
      font = font.getVariation(v);
    }
    return { font, nombre: f };
  }
  throw new Error('No encontré tipografía para "' + familyCss + '" (' + ch + ')');
}

async function contornos(page, svg) {
  await page.setContent(`<!doctype html><html><body style="margin:0">${svg}</body></html>`);
  await page.addScriptTag({ path: path.join(NM, 'paper', 'dist', 'paper-core.min.js') });
  await page.addScriptTag({ path: path.join(NM, 'paperjs-offset', 'dist', 'index.umd.js') });

  // 1) Letras: el navegador dice dónde va cada una
  const textos = await page.evaluate(() => [...document.querySelectorAll('svg text')].map((t, i) => {
    t.setAttribute('data-ti', i);
    const cs = getComputedStyle(t);
    const str = t.textContent;
    const chars = [];
    for (let k = 0; k < t.getNumberOfChars(); k++) {
      const ch = str[k];
      if (!ch || !ch.trim()) continue;
      try {
        const p = t.getStartPositionOfChar(k), e = t.getExtentOfChar(k);
        chars.push({ k, ch, x: p.x, y: p.y, rot: t.getRotationOfChar(k), w: e.width });
      } catch (err) { /* letra fuera del camino: no se dibuja */ }
    }
    const stretch = parseFloat(cs.fontStretch) || 100;
    return {
      i, str, chars, family: cs.fontFamily, weight: parseInt(cs.fontWeight, 10) || 400, stretch,
      size: parseFloat(cs.fontSize), adjust: t.getAttribute('lengthAdjust') === 'spacingAndGlyphs' && t.hasAttribute('textLength'),
    };
  }));

  const glifos = textos.map((T) => T.chars.map((c) => {
    const { font } = fuente(T.family, T.weight, T.stretch, c.ch);
    const run = font.layout(c.ch);
    const g = run.glyphs[0];
    const k = T.size / font.unitsPerEm;
    const adv = g.advanceWidth * k;
    // textLength + spacingAndGlyphs: el navegador ensancha/angosta las letras
    const sx = T.adjust && !c.rot && adv > 0 && c.w > 0 ? c.w / adv : 1;
    return { d: g.path.toSVG(), x: c.x, y: c.y, rot: c.rot, sx: sx * k, sy: -k };
  }));

  const res = await page.evaluate((glifos) => {
    paper.setup(new paper.Size(10, 10));
    const NS = 'http://www.w3.org/2000/svg';
    const PINTURA = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'stroke-opacity', 'paint-order', 'opacity', 'transform', 'style', 'class'];
    // a) textos → grupos de letras
    document.querySelectorAll('svg text').forEach((t) => {
      const gl = glifos[Number(t.dataset.ti)];
      const g = document.createElementNS(NS, 'g');
      const cs = getComputedStyle(t);
      PINTURA.forEach((a) => { if (t.hasAttribute(a)) g.setAttribute(a, t.getAttribute(a)); });
      // la pintura puede venir heredada: se fija la calculada
      g.setAttribute('fill', cs.fill); g.setAttribute('stroke', cs.stroke);
      if (cs.stroke !== 'none') { g.setAttribute('stroke-width', cs.strokeWidth); g.setAttribute('stroke-linejoin', cs.strokeLinejoin); g.setAttribute('paint-order', cs.paintOrder); }
      g.setAttribute('data-texto', t.textContent);
      gl.forEach((L) => {
        if (!L.d) return;
        const p = new paper.CompoundPath(L.d);
        p.transform(new paper.Matrix().translate(L.x, L.y).rotate(L.rot, 0, 0).scale(L.sx, L.sy));
        const el = document.createElementNS(NS, 'path');
        el.setAttribute('d', p.pathData);
        g.appendChild(el);
        p.remove();
      });
      t.replaceWith(g);
    });
    // b) bordes → figuras rellenas
    const geom = (el) => {
      const n = el.tagName.toLowerCase(), A = (a) => parseFloat(el.getAttribute(a)) || 0;
      if (n === 'path') return paper.PathItem.create(el.getAttribute('d'));
      if (n === 'rect') {
        const r = new paper.Rectangle(A('x'), A('y'), A('width'), A('height'));
        const rx = A('rx') || A('ry'), ry = A('ry') || A('rx');
        return rx ? new paper.Path.Rectangle(r, new paper.Size(rx, ry)) : new paper.Path.Rectangle(r);
      }
      if (n === 'circle') return new paper.Path.Circle(new paper.Point(A('cx'), A('cy')), A('r'));
      if (n === 'ellipse') return new paper.Path.Ellipse(new paper.Rectangle(A('cx') - A('rx'), A('cy') - A('ry'), 2 * A('rx'), 2 * A('ry')));
      if (n === 'line') return new paper.Path.Line(new paper.Point(A('x1'), A('y1')), new paper.Point(A('x2'), A('y2')));
      if (n === 'polyline' || n === 'polygon') {
        const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number);
        const p = new paper.Path();
        for (let i = 0; i + 1 < pts.length; i += 2) p.add(new paper.Point(pts[i], pts[i + 1]));
        p.closed = n === 'polygon';
        return p;
      }
      return null;
    };
    const avisos = [];
    const porGrupo = new Map(); // grupo de letras → [bordes]
    const formas = [...document.querySelectorAll('svg path, svg rect, svg circle, svg ellipse, svg line, svg polyline, svg polygon')]
      .filter((el) => !el.closest('defs, clipPath, mask'));
    formas.forEach((el) => {
      const cs = getComputedStyle(el);
      const sw = parseFloat(cs.strokeWidth);
      if (cs.stroke === 'none' || !(sw > 0)) return;
      if (cs.strokeDasharray && cs.strokeDasharray !== 'none') avisos.push('borde punteado sin convertir');
      const grupoT = el.parentNode.hasAttribute && el.parentNode.hasAttribute('data-texto') ? el.parentNode : null;
      if (grupoT && /^stroke/.test(cs.paintOrder)) {
        // texto con borde por detrás: lo visible del borde = silueta de las letras agrandada en medio ancho de borde
        if (!porGrupo.has(grupoT)) porGrupo.set(grupoT, { d: [], r: sw / 2, color: cs.stroke });
        porGrupo.get(grupoT).d.push(el.getAttribute('d'));
        el.setAttribute('stroke', 'none');
        return;
      }
      const src = geom(el);
      if (!src) return;
      let out;
      try {
        out = PaperOffset.offsetStroke(src, sw / 2, { join: cs.strokeLinejoin, cap: cs.strokeLinecap, limit: parseFloat(cs.strokeMiterlimit) || 4, insert: false });
      } catch (e) { avisos.push('no se pudo convertir un borde: ' + e.message); src.remove(); return; }
      const d = out.pathData;
      src.remove(); out.remove();
      const b = document.createElementNS(NS, 'path');
      b.setAttribute('d', d);
      b.setAttribute('fill', cs.stroke);
      b.setAttribute('fill-rule', 'nonzero');
      const so = parseFloat(cs.strokeOpacity);
      if (so < 1) b.setAttribute('fill-opacity', so);
      if (el.hasAttribute('transform')) b.setAttribute('transform', el.getAttribute('transform'));
      if (/^stroke/.test(cs.paintOrder)) el.before(b); else el.after(b);
      // la figura original queda solo con su relleno
      el.setAttribute('stroke', 'none');
      el.style.stroke = 'none';
      if (cs.fill === 'none') el.remove();
    });
    // bordes de texto (por detrás): una sola figura unida, abajo de todas las letras
    porGrupo.forEach((G, g) => {
      let u = null;
      G.d.forEach((d) => {
        let p = paper.PathItem.create(d);
        p = p.resolveCrossings ? p.resolveCrossings() : p;
        p.reorient(true, true);
        u = u ? u.unite(p, { insert: false }) : p;
      });
      let out;
      try { out = PaperOffset.offset(u, G.r, { join: 'round', insert: false }); }
      catch (e) { avisos.push('no se pudo convertir el borde de un texto: ' + e.message); return; }
      const b = document.createElementNS(NS, 'path');
      b.setAttribute('d', out.pathData);
      b.setAttribute('fill', G.color);
      g.insertBefore(b, g.firstChild);
    });
    document.querySelectorAll('[data-texto]').forEach((g) => {
      ['stroke', 'stroke-width', 'stroke-linejoin', 'paint-order'].forEach((a) => g.removeAttribute(a));
      g.setAttribute('stroke', 'none');
    });
    const quedan = document.querySelectorAll('svg text').length;
    return { svg: document.querySelector('svg').outerHTML, avisos, quedan };
  }, glifos);
  if (res.quedan) throw new Error('Quedaron ' + res.quedan + ' textos sin convertir');
  return res;
}

module.exports = { contornos };
