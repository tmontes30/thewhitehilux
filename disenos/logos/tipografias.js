// Opciones de tipografía para el "TWH" del logo 13 (race-dept). Todas son fuentes libres (OFL, uso comercial OK) en disenos/fuentes/.
// Las letras se convierten a trazos (opentype.js), así el SVG no depende de tener la fuente instalada.
// Uso: node disenos/logos/tipografias.js  ->  disenos/logos/tipografias/<letra>-<fuente>.svg y _opciones.png (hoja para elegir)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const opentype = require('opentype.js');

const BG = '#1B1C1A', INK = '#F2F0E8', ORANGE = '#F2A541', RED = '#E4572E', DRED = '#B3202A';
const FONTS = path.join(__dirname, '..', 'fuentes');
const OUT = path.join(__dirname, 'tipografias');
fs.mkdirSync(OUT, { recursive: true });

// [archivo, nombre, ¿inclinar? (las que ya vienen en cursiva no), estilo]
const OPCIONES = [
  ['RacingSansOne-Regular', 'Racing Sans One', false, 'carrera / pit lane'],
  ['Kanit-BlackItalic', 'Kanit Black Italic', false, 'deportiva moderna'],
  ['RussoOne-Regular', 'Russo One', true, 'motor / rally'],
  ['BlackOpsOne-Regular', 'Black Ops One', true, 'militar esténcil'],
  ['SairaStencilOne-Regular', 'Saira Stencil', true, 'esténcil técnica'],
  ['Bungee-Regular', 'Bungee', true, 'letrero urbano'],
  ['FasterOne-Regular', 'Faster One', false, 'líneas de velocidad'],
  ['Anton-Regular', 'Anton', true, 'condensada potente'],
  ['BowlbyOneSC-Regular', 'Bowlby One', true, 'gruesa vintage'],
  ['SquadaOne-Regular', 'Squada One', true, 'cuadrada off road'],
  ['Staatliches-Regular', 'Staatliches', true, 'condensada clásica'],
  ['Graduate-Regular', 'Graduate', true, 'college / varsity'],
  ['TitanOne-Regular', 'Titan One', true, 'redonda retro 70s'],
  ['RubikMonoOne-Regular', 'Rubik Mono One', true, 'ancha geométrica'],
  ['Audiowide-Regular', 'Audiowide', true, 'futurista'],
  ['AlfaSlabOne-Regular', 'Alfa Slab One', true, 'slab / garage'],
  ['Rye-Regular', 'Rye', false, 'western'],
  ['Bangers-Regular', 'Bangers', false, 'cómic / skate'],
  ['SedgwickAveDisplay-Regular', 'Sedgwick Ave', false, 'graffiti'],
  ['Monoton-Regular', 'Monoton', true, 'neón multilínea'],
];

const r2 = (n) => Math.round(n * 100) / 100;

// TWH convertido a trazo, ajustado a una caja de 236 × 92 con la base en y=158 (igual que el logo 13)
function twhPath(file, skew) {
  const font = opentype.loadSync(path.join(FONTS, file + '.ttf'));
  const raw = font.getPath('TWH', 0, 0, 100);
  const bb = raw.getBoundingBox();
  const w = bb.x2 - bb.x1, h = bb.y2 - bb.y1;
  const tan = skew ? Math.tan(12 * Math.PI / 180) : 0;
  const k = Math.min(228 / (w + h * tan), 90 / h);
  const p = font.getPath('TWH', 0, 0, 100 * k);
  const b = p.getBoundingBox();
  const hh = b.y2 - b.y1;
  // centrado contando lo que se corre la parte alta al inclinar (skewX alrededor de la base)
  const dx = 150 - (b.x1 + b.x2) / 2 - (hh * tan) / 2, dy = 158 - b.y2;
  const sk = skew ? ` translate(0 ${r2(b.y2)}) skewX(-12) translate(0 ${r2(-b.y2)})` : '';
  return `<g transform="translate(${r2(dx)} ${r2(dy)})${sk}"><path d="${p.toPathData(2)}" fill="${INK}"/></g>`;
}

function logo(file, skew) {
  const s = (y, c, cut) => `<path d="M30 ${y} H${270 - cut} L${262 - cut} ${y + 6} H30 Z" fill="${c}"/>`;
  return twhPath(file, skew) + s(166, ORANGE, 0) + s(176, RED, 10) + s(186, DRED, 20) +
    `<g transform="translate(150 228) skewX(-12)"><text x="0" y="0" font-family="'Arial Black', Arial, sans-serif" font-size="22" fill="${RED}" text-anchor="middle">4WD RACE DEPT.</text></g>` +
    `<text x="150" y="252" font-family="Bahnschrift, 'Arial Narrow', Arial" font-weight="700" style="font-stretch:condensed" font-size="13" fill="${INK}" text-anchor="middle" letter-spacing="6">CHILE · SINCE 2001</text>`;
}

const L = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const cols = 4, cell = 300, lab = 44, rows = Math.ceil(OPCIONES.length / cols);
let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (cell + lab)}" viewBox="0 0 ${cols * cell} ${rows * (cell + lab)}"><rect width="100%" height="100%" fill="#2A2B28"/>`;
OPCIONES.forEach(([file, name, skew, estilo], i) => {
  const inner = logo(file, skew);
  const slug = L[i] + '-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  fs.writeFileSync(path.join(OUT, slug + '.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300" width="300" height="300"><rect width="300" height="300" fill="${BG}"/>${inner}</svg>\n`);
  const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + lab);
  // recorte: el logo ocupa ~y 60-260, se muestra esa franja más grande
  sheet += `<g transform="translate(${x + 6} ${y + 6})"><rect width="${cell - 12}" height="${cell - 12}" fill="${BG}"/><g transform="translate(-6 -12) scale(1)">${inner}</g></g>`;
  sheet += `<text x="${x + cell / 2}" y="${y + cell + 14}" text-anchor="middle" font-family="Segoe UI, Arial" font-weight="700" font-size="17" fill="#F2F0E8">${L[i]}. ${name}</text>`;
  sheet += `<text x="${x + cell / 2}" y="${y + cell + 34}" text-anchor="middle" font-family="Segoe UI, Arial" font-size="13" fill="#A9A69C">${estilo}</text>`;
});
sheet += '</svg>\n';
fs.writeFileSync(path.join(OUT, '_opciones.svg'), sheet);
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => fs.existsSync(p));
if (edge) {
  execFileSync(edge, ['--headless=new', '--edge-skip-compat-layer-relaunch', '--disable-gpu', '--hide-scrollbars', `--window-size=${cols * cell},${rows * (cell + lab)}`,
    '--screenshot=' + path.join(OUT, '_opciones.png'), 'file:///' + path.join(OUT, '_opciones.svg').replace(/\\/g, '/')], { stdio: 'ignore' });
}
console.log(`${OPCIONES.length} opciones en disenos/logos/tipografias/ (hoja: _opciones.png)`);
