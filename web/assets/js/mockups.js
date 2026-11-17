// Fotos provisorias de producto: la prenda dibujada con el logo encima.
// Cuando tengas fotos reales, ponlas en "images" del producto (data/catalog.js) y estas se dejan de usar.
(function (root) {
  var GARMENTS = {
    negro: { name: 'Negro', g: '#1B1C1A', seam: '#3A3C36', light: false },
    blanco: { name: 'Blanco', g: '#F2F1EC', seam: '#CFCCC2', light: true },
    arena: { name: 'Arena', g: '#D8C8A8', seam: '#B9A784', light: true },
    oliva: { name: 'Oliva', g: '#5A5F43', seam: '#454932', light: false },
    marino: { name: 'Azul marino', g: '#1E2735', seam: '#33405A', light: false }
  };

  var TEE = 'M100 28 Q150 52 200 28 L262 58 L244 118 L214 106 L214 312 L86 312 L86 106 L56 118 L38 58 Z';
  var HOODIE = 'M92 66 L56 82 L28 248 L58 258 L84 152 L86 314 L214 314 L216 152 L242 258 L272 248 L244 82 L208 66 Z';

  // [x, y, tamaño] de la zona de estampado en un lienzo de 300 × 330
  var SHAPES = {
    'tee-front': { print: [154, 70, 54], body: function (G, E) { return '<path d="' + TEE + '" ' + G + '/><path d="M112 31 Q150 64 188 31 M56 108 L44 64 M244 108 L256 64" ' + E + '/>'; } },
    'tee-front-big': { print: [86, 70, 128], body: function (G, E) { return SHAPES['tee-front'].body(G, E); } },
    'tee-back': { print: [84, 58, 132], body: function (G, E) { return '<path d="' + TEE.replace('Q150 52', 'Q150 42') + '" ' + G + '/><path d="M112 31 Q150 44 188 31" ' + E + '/>'; } },
    'hoodie-front': { print: [166, 112, 46], body: function (G, E, I) { return '<path d="' + HOODIE + '" ' + G + '/><path d="M100 70 Q104 8 150 8 Q196 8 200 70 Q150 92 100 70 Z" ' + G + '/><path d="M116 66 Q120 26 150 26 Q180 26 184 66 Q150 82 116 66 Z" ' + I + '/><path d="M138 80 L136 126 M162 80 L164 126 M106 240 L194 240 L208 296 L92 296 Z M88 302 H212" ' + E + '/>'; } },
    'hoodie-back': { print: [78, 92, 144], body: function (G, E) { return '<path d="' + HOODIE + '" ' + G + '/><path d="M98 72 Q100 4 150 4 Q200 4 202 72 Q150 84 98 72 Z" ' + G + '/><path d="M150 6 V78 M88 302 H212" ' + E + '/>'; } },
    'cap': { print: [113, 102, 74], body: function (G, E) { return '<path d="M58 196 Q56 92 150 84 Q244 92 242 196 Z" ' + G + '/><path d="M150 84 V196 M150 84 Q104 110 96 196 M150 84 Q196 110 204 196" ' + E + '/><circle cx="150" cy="84" r="6" ' + G + '/><path d="M44 194 Q150 172 256 194 Q262 226 150 238 Q38 226 44 194 Z" ' + G + '/><path d="M62 204 Q150 188 238 204" ' + E + '/>'; } },
    'sticker': { print: [50, 64, 200], fixedLight: true, body: function () { return '<rect x="46" y="66" width="220" height="220" rx="30" style="fill:#000;fill-opacity:.12"/><rect x="40" y="58" width="220" height="220" rx="30" style="fill:#fff;stroke:#d6d6d0;stroke-width:1.5"/>'; } }
  };

  function mock(view, colorKey, label, base) {
    var shape = SHAPES[view.shape] || SHAPES['tee-front'];
    var g = GARMENTS[colorKey] || GARMENTS.negro;
    var G = 'style="fill:' + g.g + ';stroke:' + g.seam + ';stroke-width:2;stroke-linejoin:round"';
    var E = 'style="fill:none;stroke:' + g.seam + ';stroke-width:2;stroke-linecap:round"';
    var I = 'style="fill:' + g.seam + '"';
    var light = shape.fixedLight || g.light;
    var p = shape.print;
    var href = (base || 'assets/logos/') + view.logo + (light ? '-claro' : '') + '.svg';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 330" role="img" aria-label="' + (label || 'Producto') + '">' +
      '<rect width="300" height="330" fill="#fff"/>' + shape.body(G, E, I) +
      '<image href="' + href + '" x="' + p[0] + '" y="' + p[1] + '" width="' + p[2] + '" height="' + p[2] + '"/></svg>';
  }

  root.TWHMock = { GARMENTS: GARMENTS, SHAPES: SHAPES, mock: mock };
})(typeof window !== 'undefined' ? window : globalThis);
