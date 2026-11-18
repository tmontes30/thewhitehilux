// Posiciones de los logos sobre cada foto base. Lo usan configurador.html (vista previa) y aplicar.js (fotos finales).
// x, y = centro del logo en % de la foto. Tamaños = ancho de lo dibujado en % del ancho de la foto.
(function (root) {
  var VIEWS = {
    'polera-negro-frente':   { img: 'polera-negro-frente.png',   size: [528, 639], pecho: [63, 24], centro: [47.8, 23], f: 1 },
    'polera-negro-frente-2': { img: 'polera-negro-frente-2.png', size: [535, 607], pecho: [64, 26], centro: [49, 24.5], f: 1 },
    'polera-negro-espalda':  { img: 'polera-negro-espalda.png',  size: [594, 651], espalda: [51.8, 30], f: 1 },
    'polera-blanco-frente':  { img: 'polera-blanco-frente.png',  size: [610, 535], pecho: [61.5, 30], centro: [45.5, 33], f: 0.9 },
    'polera-blanco-frente-2':{ img: 'polera-blanco-frente-2.png',size: [454, 601], pecho: [70, 24], centro: [64.5, 27], f: 1.05 },
    'polera-blanco-espalda': { img: 'polera-blanco-espalda.png', size: [555, 628], espalda: [46.8, 28], f: 1 },
    'poleron-negro-frente':  { img: 'poleron-negro-frente.png',  size: [600, 574], pecho: [59, 33], centro: [40, 37], f: 0.95 },
    'poleron-negro-espalda': { img: 'poleron-negro-espalda.png', size: [415, 606], espalda: [54, 38], f: 1.2 },
    'jockey-negro':          { img: 'jockey-negro.png',          size: [520, 420], jockey: [41, 48.5], f: 1 }
  };
  var SIZES = {
    pecho: { s: 8, m: 10, l: 12.5 },
    centro: { s: 16, m: 21, l: 27 },
    espalda: { s: 24, m: 30, l: 37 },
    jockey: { s: 7, m: 8.5, l: 10.5 }
  };
  var PRICES = { polera: 19990, poleron: 34990, jockey: 15990 };
  var COLORS = { polera: ['negro', 'blanco'], poleron: ['negro'], jockey: ['negro'] };

  // Vistas (fotos) de un producto en un color
  function viewsFor(d, color) {
    if (d.tipo === 'jockey') return ['jockey-negro'];
    var g = d.tipo === 'polera' ? 'polera-' + color : 'poleron-negro';
    var v = [];
    if (d.espalda) v.push(g + '-espalda');
    v.push(g + '-frente');
    if (d.tipo === 'polera') v.push(g + '-frente-2');
    if (!d.espalda && d.tipo === 'poleron') v.push(g + '-espalda');
    return v;
  }

  // Logos que van en una vista: [{ logo, variante, x, y, w, parche }]
  function placementsFor(d, viewKey) {
    var V = VIEWS[viewKey], out = [], light = viewKey.indexOf('blanco') >= 0;
    if (V.jockey && d.jockey) {
      var pj = d.jockey.estilo === 'parche';
      out.push({ logo: d.jockey.logo, claro: pj, x: V.jockey[0], y: V.jockey[1], w: SIZES.jockey[d.jockey.tam || 'm'] * (pj ? 0.82 : 1), parche: pj });
    }
    if (V.pecho && d.frente) {
      var pos = d.frente.pos === 'centro' ? 'centro' : 'pecho';
      out.push({ logo: d.frente.logo, claro: light, x: V[pos][0], y: V[pos][1], w: SIZES[pos][d.frente.tam || 'm'] * V.f });
    }
    if (V.espalda && d.espalda) {
      out.push({ logo: d.espalda.logo, claro: light, x: V.espalda[0], y: V.espalda[1] + (+d.espalda.alto || 0), w: SIZES.espalda[d.espalda.tam || 'm'] * V.f });
    }
    return out;
  }

  // Rectángulo del SVG completo (en % de la foto) para que lo dibujado quede centrado en x,y con ancho w
  function rect(meta, viewKey, p) {
    var V = VIEWS[viewKey];
    var cw = meta.r - meta.l, svgW = p.w / cw;
    var svgH = svgW * meta.aspect * (V.size[0] / V.size[1]);
    return {
      left: p.x - svgW * (meta.l + meta.r) / 2,
      top: p.y - svgH * (meta.t + meta.b) / 2,
      width: svgW, height: svgH,
      // caja del contenido (para el parche)
      cLeft: p.x - p.w / 2, cWidth: p.w,
      cTop: p.y - svgH * (meta.b - meta.t) / 2, cHeight: svgH * (meta.b - meta.t)
    };
  }

  root.TWHPos = { VIEWS: VIEWS, SIZES: SIZES, PRICES: PRICES, COLORS: COLORS, viewsFor: viewsFor, placementsFor: placementsFor, rect: rect };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.TWHPos;
})(typeof window !== 'undefined' ? window : globalThis);
