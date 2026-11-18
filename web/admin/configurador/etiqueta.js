// Etiqueta TWH estampada en el cuello interior: logo + talla (60 x 40 mm).
// La comparten disenos/etiquetas/generar.js (archivos para la imprenta) y el configurador (vista previa).
// Dos versiones, según el color de la prenda:
//   negra  → "clara"  (1 tinta crema)
//   blanca → "oscura" (1 tinta grafito)
(function (root) {
  var FONT = "'Arial Black', 'Segoe UI Black', Arial, sans-serif";
  var VERSIONES = {
    clara: { tinta: '#F2F0E8', fondo: '#1B1C1A', para: 'negro', nombre: 'Clara (polera negra)' },
    oscura: { tinta: '#1B1C1A', fondo: '#FFFFFF', para: 'blanco', nombre: 'Oscura (polera blanca)' }
  };
  function versionPara(color) { return color === 'blanco' ? 'oscura' : 'clara'; }

  var n = 0;
  // Mismo dibujo que el logo oficial "THE WHITE HILUX · CL SHOP" (web/assets/logos/logo-shop.svg), en 1 tinta,
  // con "CL SHOP" calado dentro de su caja. Abajo la talla grande.
  // opts.width/height: tamaño del <svg> (por defecto 60mm x 40mm)
  function svg(talla, version, opts) {
    var o = opts || {};
    var ink = (VERSIONES[version] || VERSIONES.clara).tinta;
    var id = 'twh-et-' + version + '-' + talla + '-' + (n++);
    var ancho = talla.length >= 3 ? 330 : talla.length === 2 ? 260 : null; // XL/XXL más angostas
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="' + (o.width || '60mm') + '" height="' + (o.height || '40mm') + '">' +
      '<defs><mask id="' + id + '"><rect x="0" y="0" width="566" height="120" fill="#fff"/><g transform="translate(470 97) skewX(-12)"><text x="0" y="0" font-family="' + FONT + '" font-size="24" fill="#000" text-anchor="middle" letter-spacing="4">CL SHOP</text></g></mask></defs>' +
      '<g transform="translate(37 22) scale(0.93) translate(0 -8)">' +
        '<g transform="translate(14 58) skewX(-12)"><text x="0" y="0" font-family="' + FONT + '" font-size="50" fill="' + ink + '" textLength="510" lengthAdjust="spacingAndGlyphs">THE WHITE HILUX</text></g>' +
        '<path d="M8 74 H372 L366 80 H8 Z" fill="' + ink + '"/>' +
        '<path d="M8 83 H362 L356 89 H8 Z" fill="' + ink + '"/>' +
        '<path d="M8 92 H352 L346 98 H8 Z" fill="' + ink + '"/>' +
        '<path d="M392 72 H556 L546 104 H382 Z" fill="' + ink + '" mask="url(#' + id + ')"/>' +
      '</g>' +
      '<rect x="60" y="148" width="480" height="4" fill="' + ink + '" opacity=".9"/>' +
      '<text x="300" y="352" font-family="' + FONT + '" font-size="190" fill="' + ink + '" text-anchor="middle"' + (ancho ? ' textLength="' + ancho + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + talla + '</text>' +
      '</svg>';
  }

  var api = { svg: svg, VERSIONES: VERSIONES, versionPara: versionPara, TALLAS: ['S', 'M', 'L', 'XL', 'XXL'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWHEtiqueta = api;
})(this);
