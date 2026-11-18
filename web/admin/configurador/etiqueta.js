// Etiqueta TWH estampada en el cuello interior: "TWH" + franjas + "RACE SHOP" + talla (60 x 40 mm).
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

  // Iniciales "TWH" en cursiva con las 3 franjas de rally (mismo estilo del logo oficial), "RACE SHOP" debajo
  // y la talla grande. 1 sola tinta. opts.width/height: tamaño del <svg> (por defecto 60mm x 40mm)
  function svg(talla, version, opts) {
    var o = opts || {};
    var ink = (VERSIONES[version] || VERSIONES.clara).tinta;
    var ancho = talla.length >= 3 ? 300 : talla.length === 2 ? 230 : null; // XL/XXL más angostas
    // franjas: borde izquierdo recto y derecho en diagonal, cada una un poco más corta (como en el logo)
    var franja = function (y, x2) { return '<path d="M168 ' + y + ' H' + x2 + ' L' + (x2 - 8) + ' ' + (y + 9) + ' H168 Z" fill="' + ink + '"/>'; };
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 400" width="' + (o.width || '60mm') + '" height="' + (o.height || '40mm') + '">' +
      '<g transform="translate(300 118) skewX(-12)"><text x="0" y="0" font-family="' + FONT + '" font-size="122" fill="' + ink + '" text-anchor="middle" textLength="270" lengthAdjust="spacingAndGlyphs">TWH</text></g>' +
      franja(132, 440) + franja(146, 428) + franja(160, 416) +
      '<g transform="translate(300 206) skewX(-12)"><text x="0" y="0" font-family="' + FONT + '" font-size="27" fill="' + ink + '" text-anchor="middle" letter-spacing="9">RACE SHOP</text></g>' +
      '<rect x="120" y="228" width="360" height="4" fill="' + ink + '" opacity=".9"/>' +
      '<text x="300" y="378" font-family="' + FONT + '" font-size="150" fill="' + ink + '" text-anchor="middle"' + (ancho ? ' textLength="' + ancho + '" lengthAdjust="spacingAndGlyphs"' : '') + '>' + talla + '</text>' +
      '</svg>';
  }

  var api = { svg: svg, VERSIONES: VERSIONES, versionPara: versionPara, TALLAS: ['S', 'M', 'L', 'XL', 'XXL'] };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWHEtiqueta = api;
})(this);
