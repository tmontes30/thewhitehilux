// Genera los logos TWH como archivos: svg/*.svg (vectorial) y png/*.png (vista previa 1000 px).
// Uso:  node disenos/logos/generar.js            -> todos
//       node disenos/logos/generar.js rally-stripes tire   -> solo esos
// Para cambiar un logo: edita su función en LOGOS y vuelve a correr el script.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BG = '#1B1C1A', INK = '#F2F0E8', ORANGE = '#F2A541', RED = '#E4572E', DRED = '#B3202A', MUST = '#E39B2D', OLIVE = '#7A8450';
// Paletas nuevas (minimalistas 47-56)
const TEAL = '#2BB3A3', SAND = '#D9C7A3', SKY = '#7FB3E0', COBALT = '#3A5BD9', FOREST = '#3E6B4B', MINT = '#9ED9B5', CLAY = '#C2683F';
// Paletas de carrera nuevas (67-76)
const NAVY = '#1F3A5F', GOLD = '#D4A72C', LIME = '#B5E61D', PURPLE = '#7B5CC4', RUST = '#A8482B', BRG = '#2E6B4A', YELLOW = '#F2C230', PETROL = '#1F7A7A';
// Tipografías incluidas en Windows (no necesitan internet)
const IMPACT = "Impact, Haettenschweiler, 'Arial Narrow', sans-serif";
const BLACK = "'Arial Black', 'Segoe UI Black', Arial, sans-serif";
const COND = "Bahnschrift, 'Arial Narrow', Arial, sans-serif";

const t = (x, y, s, size, fill, font, extra = '') => `<text x="${x}" y="${y}" font-family="${font}" font-size="${size}" fill="${fill}" ${extra}>${s}</text>`;
const mid = 'text-anchor="middle"';
const ital = (x, y, inner) => `<g transform="translate(${x} ${y}) skewX(-12)">${inner}</g>`;
const cond = (extra = '') => `font-weight="700" style="font-stretch:condensed" ${extra}`;
const ring = (id, rTop, rBot, top, bot, topSize, botSize, topFont = BLACK) =>
  `<path id="${id}a" d="M${150 - rTop} 150 A${rTop} ${rTop} 0 0 1 ${150 + rTop} 150" fill="none"/>` +
  `<path id="${id}b" d="M${150 - rBot} 150 A${rBot} ${rBot} 0 0 0 ${150 + rBot} 150" fill="none"/>` +
  `<text font-family="${topFont}" font-size="${topSize}" letter-spacing="4" fill="${INK}"><textPath href="#${id}a" startOffset="50%" text-anchor="middle">${top}</textPath></text>` +
  `<text font-family="${COND}" ${cond()} font-size="${botSize}" letter-spacing="5" fill="${INK}"><textPath href="#${id}b" startOffset="50%" text-anchor="middle">${bot}</textPath></text>`;
const stripesKick = (dy = 0) =>
  `<path transform="translate(0 ${dy})" d="M20 150 H196 L244 86 H259 L202 162 H20 Z" fill="${ORANGE}"/>` +
  `<path transform="translate(8.5 ${dy + 17})" d="M11.5 150 H196 L244 86 H259 L202 162 H11.5 Z" fill="${RED}"/>` +
  `<path transform="translate(17 ${dy + 34})" d="M3 150 H196 L244 86 H259 L202 162 H3 Z" fill="${DRED}"/>`;
const r2 = (n) => Math.round(n * 100) / 100;

// TWH en Black Ops One (fuente libre OFL en disenos/fuentes), convertido a trazo e inclinado como el logo 13.
// Ajustado a una caja de 228 × 90 con la base en y=158.
function opsTWH(fill) {
  const opentype = require('opentype.js');
  const font = opentype.loadSync(path.join(__dirname, '..', 'fuentes', 'BlackOpsOne-Regular.ttf'));
  const tan = Math.tan(12 * Math.PI / 180);
  const bb = font.getPath('TWH', 0, 0, 100).getBoundingBox();
  const k = Math.min(228 / ((bb.x2 - bb.x1) + (bb.y2 - bb.y1) * tan), 90 / (bb.y2 - bb.y1));
  const p = font.getPath('TWH', 0, 0, 100 * k);
  const b = p.getBoundingBox();
  const dx = 150 - (b.x1 + b.x2) / 2 - ((b.y2 - b.y1) * tan) / 2, dy = 158 - b.y2;
  return `<g transform="translate(${r2(dx)} ${r2(dy)}) translate(0 ${r2(b.y2)}) skewX(-12) translate(0 ${r2(-b.y2)})"><path d="${p.toPathData(2)}" fill="${fill}"/></g>`;
}

// Texto con una tipografía libre de disenos/fuentes, convertido a trazo (no depende de fuentes instaladas).
// pt('BebasNeue-Regular', 'TWH', 60, x, y(base), color, { anchor: 'middle'|'start'|'end', ls: espaciado px, w: ancho final px, skew: grados })
const FONT_CACHE = {};
function ptGeo(file, text, size, x, y, o = {}) {
  const opentype = require('opentype.js');
  const font = FONT_CACHE[file] || (FONT_CACHE[file] = opentype.loadSync(path.join(__dirname, '..', 'fuentes', file + '.ttf')));
  const build = (sz, ox, oy) => {
    const k = sz / font.unitsPerEm;
    const glyphs = font.stringToGlyphs(text);
    let cx = 0, d = '';
    const bb = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
    glyphs.forEach((g, i) => {
      const p = g.getPath(ox + cx, oy, sz);
      const b = p.getBoundingBox();
      if (b.x2 > b.x1) { bb.x1 = Math.min(bb.x1, b.x1); bb.y1 = Math.min(bb.y1, b.y1); bb.x2 = Math.max(bb.x2, b.x2); bb.y2 = Math.max(bb.y2, b.y2); }
      d += p.toPathData(2);
      cx += g.advanceWidth * k + (o.ls || 0);
      if (i < glyphs.length - 1) cx += font.getKerningValue(g, glyphs[i + 1]) * k;
    });
    return { d, natural: cx - (o.ls || 0), bb, sz };
  };
  let g = build(size, 0, 0);
  // fit: ajusta el tamaño (parejo, sin deformar) para que el texto mida ese ancho
  if (o.fit) g = build(size * o.fit / g.natural, 0, 0);
  const sx = o.w ? o.w / g.natural : 1;
  const width = g.natural * sx;
  const anchor = o.anchor || 'middle';
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const sk = o.skew ? ` skewX(${-o.skew})` : '';
  const sc = sx !== 1 ? ` scale(${r2(sx * 1000) / 1000} 1)` : '';
  // abs: trazado ya en coordenadas finales (sin transform), para calar o combinar con otras figuras
  const A = build(g.sz, x0, y);
  return { d: g.d, tr: `translate(${r2(x0)} ${r2(y)})${sk}${sc}`, width, abs: A.d, bb: A.bb, size: g.sz };
}
// Texto en trazo. o.stroke / o.sw = contorno (o.behind: el contorno va detrás del relleno); fill 'none' = solo contorno
function pt(file, text, size, x, y, fill, o = {}) {
  const G = ptGeo(file, text, size, x, y, o);
  const st = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 2}" stroke-linejoin="round"${o.behind ? ' paint-order="stroke"' : ''}` : '';
  return `<g transform="${G.tr}"><path d="${G.d}" fill="${fill}"${st}/></g>`;
}

// Piezas de los favoritos (6, 22, 23, 27) para combinarlas en 57-66
const ESCUDO = 'M150 36 L250 62 L250 168 Q250 236 150 268 Q50 236 50 168 L50 62 Z';
const ESCUDO_IN = 'M150 50 L238 73 L238 166 Q238 225 150 254 Q62 225 62 166 L62 73 Z';
function cuadros(x, y, cols, rows, sz, col = INK) { let h = ''; for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) if ((r + k) % 2 === 0) h += '<rect x="' + r2(x + k * sz) + '" y="' + r2(y + r * sz) + '" width="' + sz + '" height="' + sz + '" fill="' + col + '"/>'; return h; }
function franjas3(x, y, w, h, gap, cols = [ORANGE, RED, DRED]) { return cols.map((c, k) => '<path d="M' + x + ' ' + (y + k * gap) + ' H' + (x + w - k * 8) + ' L' + (x + w - k * 8 - 5) + ' ' + (y + k * gap + h) + ' H' + x + ' Z" fill="' + c + '"/>').join(''); }

const LOGOS = {
  // 1. El que te gustó: TWH + franjas de rally
  'rally-stripes': () =>
    ital(30, 124, t(0, 0, 'TWH', 66, INK, BLACK)) + stripesKick() +
    ital(30, 238, t(0, 0, '4X4 RALLY TEAM', 22, RED, BLACK, 'letter-spacing="1"')) +
    t(32, 262, 'SINCE 2001 · CHILE', 13, INK, COND, cond('letter-spacing="6"')),

  // 2. TWH grande en cursiva + etiqueta 4X4
  'twh-4x4': () =>
    ital(150, 150, t(0, 0, 'TWH', 92, INK, BLACK, mid)) +
    `<rect x="98" y="168" width="104" height="42" rx="3" fill="${MUST}"/>` +
    ital(150, 202, t(0, 0, '4X4', 36, BG, IMPACT, mid + ' letter-spacing="3"')) +
    `<rect x="40" y="226" width="220" height="5" fill="${ORANGE}"/><rect x="40" y="235" width="220" height="5" fill="${RED}"/><rect x="40" y="244" width="220" height="5" fill="${DRED}"/>` +
    t(150, 274, 'OFF ROAD · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="7"')),

  // 4. Mud Terrain: neumático de frente: goma continua con surcos de hombro alternados, canal central en zigzag y curvatura
  'mud-terrain': () => {
    const cy = 112, R = 92, x0 = 100, x1 = 200, rows = 11;
    let voids = '', zig = [];
    for (let k = 0; k < rows; k++) {
      const a = -Math.PI / 2 + (k + 0.5) * Math.PI / rows, y = cy + R * Math.sin(a), sc = Math.cos(a), vh = 4 + 11 * sc, sk = 4 * sc;
      const odd = k % 2;
      if (odd) voids += `<path d="M${x0 - 6} ${r2(y - vh / 2)} L${138} ${r2(y - vh / 2 - sk)} L${141} ${r2(y + vh / 2 - sk)} L${x0 - 6} ${r2(y + vh / 2)} Z" fill="${BG}"/>`;
      else voids += `<path d="M${159} ${r2(y - vh / 2 + sk)} L${x1 + 6} ${r2(y - vh / 2)} L${x1 + 6} ${r2(y + vh / 2)} L${162} ${r2(y + vh / 2 + sk)} Z" fill="${BG}"/>`;
      zig.push(`${odd ? 140 : 160} ${r2(y)}`);
      // laminillas en los bloques
      if (sc > 0.35) {
        const sx = odd ? 176 : 118, sy = r2(y);
        voids += `<path d="M${sx - 10} ${sy} L${sx - 4} ${r2(sy - 2 * sc)} L${sx + 2} ${sy} L${sx + 8} ${r2(sy - 2 * sc)}" fill="none" stroke="${BG}" stroke-width="1.6"/>`;
      }
    }
    return `<defs><clipPath id="mtc"><rect x="${x0 - 8}" y="${cy - R}" width="${x1 - x0 + 16}" height="${2 * R}" rx="22"/></clipPath></defs>` +
      `<rect x="${x0}" y="${cy - R}" width="${x1 - x0}" height="${2 * R}" rx="24" fill="${INK}"/>` +
      `<g clip-path="url(#mtc)">${voids}<polyline points="${zig.join(' ')}" fill="none" stroke="${BG}" stroke-width="5" stroke-linejoin="miter"/></g>` +
      t(30, 250, 'MUD TERRAIN', 50, MUST, IMPACT, 'textLength="240" lengthAdjust="spacingAndGlyphs"') +
      t(150, 278, 'TWH · 4X4 · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="7"'));
  },

  // 5. Aired Down: manómetro marcando 15 PSI (presión para arena y barro)
  'aired-down': () => {
    const cx = 150, cy = 150, ang = (psi) => (150 + (psi / 40) * 240) * Math.PI / 180;
    const pt = (psi, r) => [r2(cx + r * Math.cos(ang(psi))), r2(cy + r * Math.sin(ang(psi)))];
    const arc = (p0, p1, r) => { const a = pt(p0, r), b = pt(p1, r); return `M${a[0]} ${a[1]} A${r} ${r} 0 ${((p1 - p0) / 40) * 240 > 180 ? 1 : 0} 1 ${b[0]} ${b[1]}`; };
    let ticks = '';
    for (let p = 0; p <= 40; p += 2.5) {
      const major = p % 10 === 0, a = pt(p, 96), b = pt(p, major ? 80 : 87);
      ticks += `<path d="M${a[0]} ${a[1]} L${b[0]} ${b[1]}" stroke="${INK}" stroke-width="${major ? 4 : 2}"/>`;
      if (major) { const l = pt(p, 64); ticks += t(l[0], l[1] + 6, String(p), 16, INK, COND, mid + ' ' + cond()); }
    }
    const tip = pt(15, 84), bl = [r2(cx + 6 * Math.cos(ang(15) + Math.PI / 2)), r2(cy + 6 * Math.sin(ang(15) + Math.PI / 2))], br = [r2(cx - 6 * Math.cos(ang(15) + Math.PI / 2)), r2(cy - 6 * Math.sin(ang(15) + Math.PI / 2))];
    return `<path d="${arc(0, 40, 104)}" fill="none" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="${arc(10, 20, 96)}" fill="none" stroke="${MUST}" stroke-width="10"/>` + ticks +
      `<path d="M${tip[0]} ${tip[1]} L${bl[0]} ${bl[1]} L${br[0]} ${br[1]} Z" fill="${RED}"/>` +
      `<circle cx="150" cy="150" r="11" fill="${INK}"/><circle cx="150" cy="150" r="4" fill="${BG}"/>` +
      t(150, 196, 'PSI', 15, MUST, COND, mid + ' ' + cond('letter-spacing="4"')) +
      t(150, 252, 'AIRED DOWN', 34, INK, BLACK, mid) +
      t(150, 278, 'TWH · OFF ROAD · CHILE', 13, MUST, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 6. Escudo con bandera a cuadros
  'checkered-shield': () => {
    let ch = '';
    for (let r = 0; r < 3; r++) for (let k = 0; k < 16; k++) if ((r + k) % 2 === 0) ch += `<rect x="${70 + k * 10}" y="${84 + r * 10}" width="10" height="10" fill="${INK}"/>`;
    return `<path d="M150 36 L250 62 L250 168 Q250 236 150 268 Q50 236 50 168 L50 62 Z" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
      `<path d="M150 50 L238 73 L238 166 Q238 225 150 254 Q62 225 62 166 L62 73 Z" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` + ch +
      ital(144, 170, t(0, 0, 'TWH', 58, RED, BLACK, mid)) +
      t(151, 196, '4X4 TEAM', 18, INK, BLACK, mid + ' letter-spacing="2"') +
      t(153, 218, 'EST. 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 7. Palanca de transferencia 2H-4H-N-4L
  'low-range': () => {
    const pos = [[62, '2H'], [121, '4H'], [180, 'N'], [238, '4L']];
    return t(150, 100, '4WD', 70, INK, IMPACT, mid + ' letter-spacing="4"') +
      `<rect x="40" y="128" width="220" height="28" rx="14" fill="none" stroke="${INK}" stroke-width="4"/>` +
      pos.map(([x, l]) => `<rect x="${x - 1.5}" y="160" width="3" height="8" fill="${INK}"/>` + t(x, 190, l, 20, INK, COND, mid + ' ' + cond())).join('') +
      `<circle cx="238" cy="142" r="17" fill="${MUST}"/><circle cx="238" cy="142" r="7" fill="${BG}"/>` +
      t(150, 234, 'LOW RANGE CLUB', 22, INK, BLACK, mid + ' letter-spacing="1"') +
      t(150, 258, 'TWH · CHILE', 13, MUST, COND, mid + ' ' + cond('letter-spacing="8"'));
  },

  // 8. Recovery Crew tipográfico con eslinga de arrastre
  'recovery-crew': () => {
    const strap = (y) =>
      `<rect x="56" y="${y - 4}" width="188" height="8" fill="${MUST}"/>` +
      `<rect x="30" y="${y - 11}" width="34" height="22" rx="11" fill="none" stroke="${MUST}" stroke-width="7"/>` +
      `<rect x="236" y="${y - 11}" width="34" height="22" rx="11" fill="none" stroke="${MUST}" stroke-width="7"/>` +
      [90, 120, 150, 180, 210].map((x) => `<rect x="${x}" y="${y - 4}" width="2" height="8" fill="${BG}"/>`).join('');
    return t(150, 66, 'TWH · 4X4', 16, INK, COND, mid + ' ' + cond('letter-spacing="10"')) +
      strap(90) +
      t(150, 176, 'RECOVERY', 74, INK, IMPACT, mid + ' textLength="236" lengthAdjust="spacingAndGlyphs"') +
      `<rect x="80" y="188" width="140" height="44" fill="${MUST}"/>` +
      t(150, 222, 'CREW', 30, BG, BLACK, mid + ' letter-spacing="5"') +
      strap(254) +
      t(150, 290, 'CHILE · EST. 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="7"'));
  },

  // 10. Sol retro de los 70 con franjas
  'sunset': () =>
    `<defs><clipPath id="sun"><circle cx="150" cy="128" r="92"/></clipPath></defs>` +
    `<g clip-path="url(#sun)"><rect x="50" y="30" width="200" height="104" fill="${MUST}"/>` +
    `<rect x="50" y="138" width="200" height="16" fill="${ORANGE}"/><rect x="50" y="159" width="200" height="14" fill="${RED}"/>` +
    `<rect x="50" y="178" width="200" height="12" fill="${RED}"/><rect x="50" y="195" width="200" height="10" fill="${DRED}"/><rect x="50" y="210" width="200" height="8" fill="${DRED}"/></g>` +
    t(150, 262, 'TWH', 46, INK, BLACK, mid + ' letter-spacing="6"') +
    t(150, 286, 'OFF ROAD · 2001', 14, INK, COND, mid + ' ' + cond('letter-spacing="7"')),

  // 11. Patente chilena
  'patente': () =>
    `<rect x="18" y="80" width="264" height="140" rx="12" fill="none" stroke="${INK}" stroke-width="6"/>` +
    `<rect x="28" y="90" width="244" height="120" rx="6" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    t(150, 113, 'CHILE', 16, INK, COND, mid + ' ' + cond('letter-spacing="10"')) +
    t(38, 180, 'TWH·4X4', 70, INK, IMPACT, 'textLength="224" lengthAdjust="spacingAndGlyphs"') +
    `<rect x="28" y="190" width="244" height="20" fill="${MUST}"/>` +
    t(150, 205, 'OFF ROAD · 2001', 12, BG, COND, mid + ' ' + cond('letter-spacing="6"')) +
    `<circle cx="44" cy="101" r="3.5" fill="${INK}"/><circle cx="256" cy="101" r="3.5" fill="${INK}"/>`,

  // 13. Race Dept.
  'race-dept': () => {
    const s = (y, c, cut) => `<path d="M30 ${y} H${270 - cut} L${262 - cut} ${y + 6} H30 Z" fill="${c}"/>`;
    return ital(150, 150, t(0, 0, 'TWH', 100, INK, BLACK, mid)) + s(166, ORANGE, 0) + s(176, RED, 10) + s(186, DRED, 20) +
      ital(150, 228, t(0, 0, '4WD RACE DEPT.', 22, RED, BLACK, mid)) +
      t(150, 252, 'CHILE · SINCE 2001', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 14. Off Road en letra manuscrita retro
  'off-road-script': () =>
    t(150, 78, 'T W H', 15, RED, COND, mid + ' ' + cond('letter-spacing="8"')) +
    `<g transform="rotate(-7 150 150)">` +
    t(150, 168, 'Off Road', 54, INK, "'Segoe Script', 'Brush Script MT', cursive", mid + ' font-weight="700"') +
    `<path d="M66 186 C120 174 190 172 240 166 C204 182 150 190 94 194 Z" fill="${RED}"/>` +
    `</g>` +
    `<rect x="70" y="228" width="160" height="2" fill="${INK}"/>` +
    t(150, 254, 'SINCE 2001 · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="7"')),

  // 15. Off Road Team: letra manuscrita sobre medio sol (id coordenadas se mantiene)
  'coordenadas': () => {
    let rays = '';
    for (let k = 0; k < 12; k++) {
      const a0 = Math.PI + k * Math.PI / 12, a1 = a0 + Math.PI / 24;
      rays += `<path d="M150 132 L${r2(150 + 100 * Math.cos(a0))} ${r2(132 + 100 * Math.sin(a0))} L${r2(150 + 100 * Math.cos(a1))} ${r2(132 + 100 * Math.sin(a1))} Z" fill="${k % 2 ? ORANGE : MUST}"/>`;
    }
    return `<defs><clipPath id="ort"><path d="M72 132 A78 78 0 0 1 228 132 Z"/></clipPath></defs>` +
      `<g clip-path="url(#ort)">${rays}</g>` +
      `<path d="M56 132 H244" stroke="${INK}" stroke-width="3"/>` +
      `<g transform="rotate(-6 150 180)"><text x="150" y="190" text-anchor="middle" font-family="'Segoe Script', cursive" font-weight="700" font-size="54" fill="${INK}" stroke="${BG}" stroke-width="11" paint-order="stroke" stroke-linejoin="round">Off Road</text></g>` +
      t(150, 238, 'TEAM', 32, RED, BLACK, mid + ' letter-spacing="12"') +
      t(150, 268, 'TWH · EST. 2001 · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 16. TWH Supply Co. (etiqueta tipográfica)
  'supply-co': () =>
    `<rect x="34" y="62" width="232" height="176" rx="8" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="44" y="72" width="212" height="156" rx="4" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    t(150, 100, 'EST. 2001', 13, MUST, COND, mid + ' ' + cond('letter-spacing="8"')) +
    t(150, 160, 'TWH', 56, INK, BLACK, mid + ' letter-spacing="3"') +
    `<rect x="64" y="172" width="172" height="4" fill="${MUST}"/>` +
    t(150, 202, 'SUPPLY CO.', 24, INK, COND, mid + ' ' + cond('letter-spacing="7"')) +
    t(150, 222, 'OFF ROAD GOODS · CHILE', 10, MUST, COND, mid + ' ' + cond('letter-spacing="3"')) +
    t(66, 146, '★', 14, INK, 'Arial', mid) + t(234, 146, '★', 14, INK, 'Arial', mid),

  // ---------- Nuevos (inspirados en la carpeta ideas) ----------
  // 19. Texto ondulado repetido
  'warp-text': () => {
    let g = '';
    for (let k = 0; k < 6; k++) {
      const y = 62 + k * 38, a = (k - 2.5) * 12;
      g += `<path id="wv${k}" d="M18 ${y} C 95 ${y - a}, 205 ${y + a}, 282 ${y}" fill="none"/>` +
        `<text font-family="${BLACK}" font-size="27" fill="${k === 2 || k === 3 ? MUST : INK}" textLength="262" lengthAdjust="spacingAndGlyphs"><textPath href="#wv${k}">THE WHITE HILUX</textPath></text>`;
    }
    return g + t(150, 290, 'OFF ROAD · CHILE', 12, INK, COND, mid + ' ' + cond('letter-spacing="8"'));
  },

  // 19. Race Shop estilo Troy Lee: manuscrita con sombra roja y banda (id mountain-patch se mantiene)
  'mountain-patch': () =>
    t(150, 74, 'EST. 2001', 14, INK, COND, mid + ' ' + cond('letter-spacing="8"')) +
    `<g transform="rotate(-8 150 138)">` +
    `<text x="155" y="152" text-anchor="middle" font-family="'Segoe Script', cursive" font-weight="700" font-size="58" fill="${RED}">TWH</text>` +
    `<text x="150" y="147" text-anchor="middle" font-family="'Segoe Script', cursive" font-weight="700" font-size="58" fill="${INK}" stroke="${BG}" stroke-width="3" paint-order="stroke" stroke-linejoin="round">TWH</text></g>` +
    `<path d="M66 184 H244 L234 222 H56 Z" fill="${RED}"/>` +
    ital(150, 211, t(0, 0, 'RACE SHOP', 22, BG, BLACK, mid + ' letter-spacing="2"')) +
    t(150, 254, 'TWH · OFF ROAD · CHILE', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"')),

  // 21. Letra manuscrita sobre banda a cuadros
  'script-checker': () => {
    let ch = '';
    for (let r = 0; r < 2; r++) for (let k = 0; k < 20; k++) if ((r + k) % 2 === 0) ch += `<rect x="${40 + k * 11}" y="${172 + r * 11}" width="11" height="11" fill="${INK}"/>`;
    return t(150, 86, 'T H E', 16, RED, COND, mid + ' ' + cond('letter-spacing="6"')) +
      `<g transform="rotate(-6 150 140)">` +
      `<text x="150" y="150" text-anchor="middle" font-family="'Segoe Script', cursive" font-weight="700" font-size="40" fill="${INK}" stroke="${BG}" stroke-width="10" paint-order="stroke" stroke-linejoin="round">White Hilux</text></g>` +
      ch + t(150, 228, 'OFF ROAD · CHILE · 2001', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 22. Sello Off Road Supply: placa de esquinas cortadas (id round-stamp se mantiene)
  'round-stamp': () =>
    `<path d="M48 82 H252 L270 100 V200 L252 218 H48 L30 200 V100 Z" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M54 92 H246 L260 106 V194 L246 208 H54 L40 194 V106 Z" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    t(150, 118, 'THE WHITE HILUX', 14, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
    t(150, 166, 'TWH', 50, INK, BLACK, mid + ' letter-spacing="3"') +
    `<rect x="104" y="174" width="92" height="5" fill="${RED}"/>` +
    t(150, 198, 'OFF ROAD SUPPLY', 13, INK, COND, mid + ' ' + cond('letter-spacing="5"')) +
    t(64, 156, '★', 13, INK, 'Arial', mid) + t(236, 156, '★', 13, INK, 'Arial', mid),

  // 24. Speed Shop con bandera a cuadros
  'speed-shop': () => {
    let ch = '';
    for (let r = 0; r < 4; r++) for (let k = 0; k < 10; k++) if ((r + k) % 2 === 0) ch += `<rect x="${k * 12}" y="${r * 12}" width="12" height="12" fill="${INK}"/>`;
    return `<g transform="translate(96 58) skewX(-14)">${ch}<rect width="120" height="48" fill="none" stroke="${INK}" stroke-width="2"/></g>` +
      ital(143, 176, t(0, 0, 'TWH', 72, INK, BLACK, mid)) +
      ital(150, 214, t(0, 0, 'SPEED SHOP', 30, MUST, IMPACT, mid + ' letter-spacing="5"')) +
      `<path d="M60 228 H250 L246 233 H56 Z" fill="${ORANGE}"/><path d="M60 237 H244 L240 242 H56 Z" fill="${RED}"/>` +
      t(153, 268, 'OFF ROAD · CHILE · 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 24. Off Road Dept. estilo Troy Lee: letras altas con sombra roja desplazada
  'tall-stack': () =>
    t(150, 56, 'THE WHITE HILUX', 13, INK, COND, mid + ' ' + cond('letter-spacing="7"')) +
    t(156, 186, 'TWH', 150, RED, IMPACT, mid + ' textLength="214" lengthAdjust="spacingAndGlyphs"') +
    t(150, 180, 'TWH', 150, INK, IMPACT, mid + ' textLength="214" lengthAdjust="spacingAndGlyphs" stroke="' + BG + '" stroke-width="3" paint-order="stroke" stroke-linejoin="round"') +
    `<rect x="43" y="196" width="214" height="4" fill="${INK}"/>` +
    ital(150, 232, t(0, 0, 'OFF ROAD DEPT.', 26, INK, BLACK, mid + ' letter-spacing="1"')) +
    t(150, 258, '4X4 &amp; SPEED', 13, RED, COND, mid + ' ' + cond('letter-spacing="8"')),

  // 17. LOGO OFICIAL: The White Hilux · CL Shop (versión cuadrada)
  'cl-shop': () => {
    const bars = (y0, x1) => [ORANGE, RED, DRED].map((c, k) => `<path d="M40 ${y0 + k * 9} H${x1 - k * 10} L${x1 - k * 10 - 6} ${y0 + k * 9 + 6} H40 Z" fill="${c}"/>`).join('');
    return t(150, 84, 'THE', 20, MUST, COND, mid + ' ' + cond('letter-spacing="14"')) +
      ital(150, 148, t(0, 0, 'WHITE', 62, INK, BLACK, mid + ' textLength="226" lengthAdjust="spacingAndGlyphs"')) +
      ital(150, 210, t(0, 0, 'HILUX', 62, INK, BLACK, mid + ' textLength="226" lengthAdjust="spacingAndGlyphs"')) +
      bars(222, 262) +
      `<path d="M82 254 H226 L218 284 H74 Z" fill="${MUST}"/>` +
      ital(150, 278, t(0, 0, 'CL SHOP', 18, BG, BLACK, mid + ' letter-spacing="3"'));
  },

  // 27. LOGO OFICIAL (desde 2026-11-19): Race Dept. con TWH en Black Ops One (opción D)
  'race-dept-ops': () => {
    const s = (y, c, cut) => `<path d="M30 ${y} H${270 - cut} L${262 - cut} ${y + 6} H30 Z" fill="${c}"/>`;
    return opsTWH(INK) + s(166, ORANGE, 0) + s(176, RED, 10) + s(186, DRED, 20) +
      ital(150, 228, t(0, 0, '4WD RACE DEPT.', 22, RED, BLACK, mid)) +
      t(150, 252, 'CHILE · SINCE 2001', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },
  // ---------- 28-31: tanda 2026-11-24 (de 10 propuestas quedaron estas 4) (4x4 / off road, en la línea de los elegidos para las poleras) ----------
  // 30. Stay Dirty: manuscrita con salpicaduras de barro
  'stay-dirty': () => {
    const dots = [[64, 92, 7], [78, 78, 3.5], [232, 96, 6], [248, 116, 3], [92, 206, 4], [216, 200, 8], [236, 214, 3.5], [56, 176, 3], [120, 72, 2.5], [196, 70, 4]];
    return dots.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${MUST}"/>`).join('') +
      `<path d="M58 96 q10 -8 20 -2 M220 206 q8 10 20 4" stroke="${MUST}" stroke-width="3" fill="none" stroke-linecap="round"/>` +
      `<g transform="rotate(-8 150 150)">` + pt('Yellowtail-Regular', 'Stay Dirty', 72, 150, 164, INK, { w: 236 }) +
      `<path d="M66 182 C120 170 196 168 246 160 C206 178 140 186 86 190 Z" fill="${RED}"/></g>` +
      ital(150, 238, t(0, 0, 'TWH 4X4', 26, INK, BLACK, mid + ' letter-spacing="2"')) +
      t(150, 262, 'MUD DEPT. · CHILE', 12, MUST, COND, mid + ' ' + cond('letter-spacing="7"'));
  },

  // 31. Winch Crew (cable de winche, sin gancho)
  'winch-crew': () =>
    pt('BlackOpsOne-Regular', 'WINCH', 64, 150, 128, INK, { w: 216 }) +
    pt('BlackOpsOne-Regular', 'CREW', 64, 150, 196, RED, { w: 168 }) +
    `<path d="M40 214 H260" stroke="${MUST}" stroke-width="4" stroke-dasharray="7 3"/>` +
    t(150, 70, 'TWH RECOVERY', 14, INK, COND, mid + ' ' + cond('letter-spacing="8"')) +
    t(150, 250, '12.000 LBS · PULL HARD', 12, MUST, COND, mid + ' ' + cond('letter-spacing="5"')),
  // ---------- 32-36: TWH en estilos nuevos (2026-11-24) ----------
  // 32. Monograma: T, W y H entrelazadas en un anillo (como sello de marca clásica)
  'twh-monogram': () => {
    const L = (ch, size, x, y, fill) => pt('AlfaSlabOne-Regular', ch, size, x, y, fill, { stroke: BG, sw: 7, behind: true });
    return `<circle cx="150" cy="150" r="128" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="150" cy="150" r="96" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
      ring('mono', 106, 117, 'THE WHITE HILUX', '4X4 · EST. 2001', 17, 14) +
      t(48, 156, '★', 12, MUST, 'Arial', mid) + t(252, 156, '★', 12, MUST, 'Arial', mid) +
      L('T', 74, 98, 178, MUST) + L('H', 74, 204, 178, RED) + L('W', 80, 151, 182, INK) +
      `<path d="M92 196 H210" stroke="${INK}" stroke-width="2"/>` + t(151, 214, 'OFF ROAD', 11, INK, COND, mid + ' ' + cond('letter-spacing="5"'));
  },

  // 35. Caja de equipo militar: TWH esténcil, "Property of", lote y flechas
  'twh-crate': () => {
    const br = (x, y, dx, dy) => `<path d="M${x} ${y + dy * 22} V${y} H${x + dx * 22}" fill="none" stroke="${MUST}" stroke-width="5"/>`;
    const flecha = (x) => `<path d="M${x} 166 V136 M${x - 8} 146 L${x} 134 L${x + 8} 146" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>`;
    return `<rect x="40" y="62" width="220" height="176" fill="none" stroke="${INK}" stroke-width="3"/>` +
      br(30, 52, 1, 1) + br(270, 52, -1, 1) + br(30, 248, 1, -1) + br(270, 248, -1, -1) +
      t(150, 92, 'PROPERTY OF', 13, MUST, COND, mid + ' ' + cond('letter-spacing="8"')) +
      pt('SairaStencilOne-Regular', 'TWH', 84, 150, 170, INK, { fit: 136 }) +
      flecha(58) + flecha(242) +
      `<rect x="40" y="186" width="220" height="26" fill="${INK}"/>` +
      t(150, 205, 'OFF ROAD DIV. · 4X4', 15, BG, COND, mid + ' ' + cond('letter-spacing="5"')) +
      t(150, 230, 'LOT Nº 2001 · HANDLE WITH MUD', 10, INK, COND, mid + ' ' + cond('letter-spacing="3"'));
  },

  // 36. Eco: TWH sólido que se repite en contorno (streetwear)
  'twh-echo': () => {
    const f = (y, fill, o) => pt('BowlbyOneSC-Regular', 'TWH', 60, 150, y, fill, { fit: 168, ...o });
    // cada copia lleva relleno del color de fondo: tapa a la de abajo y queda escalonado
    return f(222, BG, { stroke: DRED, sw: 2.5 }) + f(190, BG, { stroke: RED, sw: 2.5 }) + f(158, BG, { stroke: MUST, sw: 2.5 }) +
      f(120, INK, { stroke: BG, sw: 6, behind: true }) +
      t(150, 52, '4X4 · OFF ROAD · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
      t(150, 270, 'THE WHITE HILUX · EST. 2001', 12, MUST, COND, mid + ' ' + cond('letter-spacing="5"'));
  },
  // ---------- 37-46: TWH modernos (2026-11-24) ----------
  // 37. Split: TWH cortado al medio, la mitad de abajo desplazada en rojo
  'twh-split': () => {
    const G = ptGeo('Anton-Regular', 'TWH', 100, 150, 196, { fit: 206 });
    const m = r2((G.bb.y1 + G.bb.y2) / 2);
    return `<defs><clipPath id="spt"><rect x="0" y="0" width="300" height="${r2(m - 3)}"/></clipPath><clipPath id="spb"><rect x="0" y="${r2(m + 3)}" width="300" height="300"/></clipPath></defs>` +
      `<g clip-path="url(#spt)"><path d="${G.abs}" fill="${INK}"/></g>` +
      `<g clip-path="url(#spb)"><g transform="translate(12 0)"><path d="${G.abs}" fill="${RED}"/></g></g>` +
      `<rect x="34" y="${r2(m - 1)}" width="54" height="2" fill="${MUST}"/>` +
      t(44, r2(G.bb.y1 - 16), 'THE WHITE HILUX', 12, INK, COND, cond('letter-spacing="5"')) +
      t(256, r2(G.bb.y2 + 26), '4X4 · EST. 2001', 12, MUST, COND, 'text-anchor="end" ' + cond('letter-spacing="5"'));
  },

  // 38. Spec: TWH en contorno fino con cotas de plano técnico
  'twh-spec': () => {
    const G = ptGeo('RussoOne-Regular', 'TWH', 90, 150, 176, { fit: 196 });
    const { x1, y1, x2, y2 } = G.bb;
    const cruz = (x, y) => `<path d="M${x - 7} ${y} H${x + 7} M${x} ${y - 7} V${y + 7}" stroke="${MUST}" stroke-width="1.5"/>`;
    return `<path d="${G.abs}" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>` +
      `<path d="M${r2(x1)} ${r2(y1 - 22)} H${r2(x2)} M${r2(x1)} ${r2(y1 - 28)} V${r2(y1 - 16)} M${r2(x2)} ${r2(y1 - 28)} V${r2(y1 - 16)}" stroke="${INK}" stroke-width="1.2"/>` +
      `<rect x="128" y="${r2(y1 - 30)}" width="44" height="14" fill="${BG}"/>` + t(150, r2(y1 - 19), '4X4', 11, MUST, COND, mid + ' ' + cond('letter-spacing="2"')) +
      `<path d="M${r2(x2 + 18)} ${r2(y1)} V${r2(y2)} M${r2(x2 + 12)} ${r2(y1)} H${r2(x2 + 24)} M${r2(x2 + 12)} ${r2(y2)} H${r2(x2 + 24)}" stroke="${INK}" stroke-width="1.2"/>` +
      `<text transform="translate(${r2(x2 + 30)} ${r2((y1 + y2) / 2)}) rotate(90)" text-anchor="middle" font-family="${COND}" font-weight="700" style="font-stretch:condensed" font-size="11" fill="${MUST}" letter-spacing="2">2001</text>` +
      cruz(36, 60) + cruz(264, 60) + cruz(36, 244) + cruz(264, 244) +
      t(150, 236, 'TWH · SPEC 4X4-01 · OFF ROAD', 11, INK, COND, mid + ' ' + cond('letter-spacing="4"'));
  },

  // 39. Pill: píldora tipo sticker moderno con círculo 4X4
  'twh-pill': () =>
    t(150, 98, 'EST. 2001', 12, MUST, COND, mid + ' ' + cond('letter-spacing="8"')) +
    `<rect x="36" y="110" width="228" height="82" rx="41" fill="${INK}"/>` +
    pt('RubikMonoOne-Regular', 'TWH', 50, 126, 168, BG, { fit: 128 }) +
    `<circle cx="222" cy="151" r="31" fill="${RED}"/>` +
    pt('BebasNeue-Regular', '4X4', 30, 222, 162, INK, { ls: 1 }) +
    t(150, 222, 'OFF ROAD CLUB', 16, INK, COND, mid + ' ' + cond('letter-spacing="9"')),

  // 40. Vertical: T, W y H apiladas con texto vertical (editorial)
  'twh-vertical': () => {
    const L = (ch, y, c) => pt('Anton-Regular', ch, 76, 116, y, c, {});
    return L('T', 108, INK) + L('W', 182, INK) + L('H', 256, RED) +
      `<rect x="178" y="40" width="6" height="216" fill="${RED}"/>` +
      `<text transform="translate(206 148) rotate(90)" text-anchor="middle" font-family="${COND}" font-weight="700" style="font-stretch:condensed" font-size="17" fill="${INK}" letter-spacing="7">THE WHITE HILUX</text>` +
      `<text transform="translate(232 148) rotate(90)" text-anchor="middle" font-family="${COND}" font-weight="700" style="font-stretch:condensed" font-size="11" fill="${MUST}" letter-spacing="5">4X4 · OFF ROAD · EST. 2001</text>` +
      `<rect x="60" y="40" width="2" height="216" fill="${INK}" fill-opacity=".35"/>`;
  },

  // 45. 3D: TWH con volumen extruido
  'twh-extrude': () => {
    const G = ptGeo('RussoOne-Regular', 'TWH', 90, 144, 172, { fit: 198 });
    let ext = '';
    for (let i = 14; i >= 1; i--) ext += `<g transform="translate(${r2(i * 0.9)} ${r2(i * 0.9)})"><path d="${G.abs}" fill="${i > 9 ? DRED : RED}"/></g>`;
    return ext + `<path d="${G.abs}" fill="${INK}" stroke="${BG}" stroke-width="1.5" stroke-linejoin="round"/>` +
      t(150, 76, 'EST. 2001', 13, MUST, COND, mid + ' ' + cond('letter-spacing="9"')) +
      t(150, 226, 'OFF ROAD · 4X4 · CHILE', 13, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 46. Calado: barra roja con TWH calado (minimalista suizo)
  'twh-knockout': () => {
    // letras dentro de la barra (106-206), centradas en alto
    const g0 = ptGeo('Anton-Regular', 'TWH', 90, 150, 0, { fit: 150 });
    const G = ptGeo('Anton-Regular', 'TWH', 90, 150, r2(156 - (g0.bb.y1 + g0.bb.y2) / 2), { fit: 150 });
    return t(34, 96, 'THE WHITE HILUX', 12, INK, COND, cond('letter-spacing="4"')) +
      t(266, 96, '4X4', 12, MUST, COND, 'text-anchor="end" ' + cond('letter-spacing="4"')) +
      `<path d="M34 106 H266 V206 H34 Z ${G.abs}" fill="${RED}" fill-rule="evenodd"/>` +
      `<path d="M34 220 H266" stroke="${INK}" stroke-width="1.5"/>` +
      t(34, 238, 'OFF ROAD', 12, INK, COND, cond('letter-spacing="4"')) +
      t(266, 238, 'EST. 2001 · CHILE', 12, INK, COND, 'text-anchor="end" ' + cond('letter-spacing="4"'));
  },
  // ---------- 47-56: minimalistas con paletas nuevas (2026-11-25) ----------
  // 47. Montaña de una línea en círculo (verde azulado + arena)
  'mini-mountain': () =>
    `<circle cx="150" cy="128" r="78" fill="none" stroke="${SAND}" stroke-width="3"/>` +
    `<path d="M88 160 L124 112 L142 134 L166 98 L212 160" fill="none" stroke="${TEAL}" stroke-width="7" stroke-linejoin="round" stroke-linecap="round"/>` +
    `<circle cx="186" cy="92" r="7" fill="${SAND}"/>` +
    pt('BebasNeue-Regular', 'TWH', 40, 150, 248, INK, { ls: 14 }) +
    t(150, 270, 'OUTDOOR · 4X4 · 2001', 10, TEAL, COND, mid + ' ' + cond('letter-spacing="6"')),

  // 49. Horizonte: sol y tres líneas de camino (cielo + terracota)
  'mini-horizon': () =>
    `<path d="M112 150 A38 38 0 0 1 188 150 Z" fill="${CLAY}"/>` +
    `<rect x="60" y="150" width="180" height="6" rx="3" fill="${SKY}"/><rect x="84" y="168" width="132" height="6" rx="3" fill="${SKY}"/><rect x="110" y="186" width="80" height="6" rx="3" fill="${SKY}"/>` +
    t(60, 238, 'TWH', 22, INK, BLACK, 'letter-spacing="4"') +
    t(240, 238, 'EST. 2001', 12, SKY, COND, 'text-anchor="end" ' + cond('letter-spacing="4"')) +
    `<rect x="60" y="248" width="180" height="1.5" fill="${INK}" fill-opacity=".5"/>`,

  // 52. TWH en contorno dentro de un rectángulo redondeado (tipo ícono de app)
  'mini-outline': () =>
    `<rect x="44" y="96" width="212" height="108" rx="54" fill="none" stroke="${MINT}" stroke-width="5"/>` +
    pt('RubikMonoOne-Regular', 'TWH', 44, 150, 166, 'none', { fit: 140, stroke: INK, sw: 2.5 }) +
    t(150, 232, '4X4 · OFF ROAD · CHILE', 11, MINT, COND, mid + ' ' + cond('letter-spacing="6"')),

  // 53. Curvas de nivel cuadradas (terracota + arena)
  'mini-topo': () =>
    [0, 1, 2, 3].map((k) => `<rect x="${70 + k * 16}" y="${50 + k * 16}" width="${160 - k * 32}" height="${160 - k * 32}" rx="${36 - k * 6}" fill="none" stroke="${k === 3 ? CLAY : SAND}" stroke-width="${k === 3 ? 5 : 2.5}"/>`).join('') +
    `<circle cx="150" cy="130" r="5" fill="${CLAY}"/>` +
    pt('Staatliches-Regular', 'TWH', 34, 150, 256, INK, { ls: 10 }) +
    t(150, 276, 'ALTITUDE 4X4', 10, SAND, COND, mid + ' ' + cond('letter-spacing="6"')),

  // 54. Marca de sendero (rombo con flecha) (verde azulado)
  'mini-trail': () =>
    `<rect x="104" y="58" width="92" height="92" rx="10" fill="${TEAL}" transform="rotate(45 150 104)"/>` +
    `<path d="M128 104 H164 M152 90 L166 104 L152 118" fill="none" stroke="${BG}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>` +
    pt('BebasNeue-Regular', 'TWH TRAILS', 44, 150, 222, INK, { ls: 5 }) +
    `<rect x="110" y="236" width="80" height="3" rx="1.5" fill="${TEAL}"/>` +
    t(150, 258, 'FIND YOUR WAY', 11, SAND, COND, mid + ' ' + cond('letter-spacing="6"')),

  // 55. Wordmark en minúscula con punto (bosque + menta)
  'mini-wordmark': () =>
    pt('Kanit-BlackItalic', 'twh', 110, 140, 176, INK, { fit: 170 }) +
    `<circle cx="236" cy="168" r="11" fill="${MINT}"/>` +
    `<rect x="56" y="198" width="188" height="3" rx="1.5" fill="${FOREST}"/>` +
    t(150, 224, 'the white hilux · 4x4 · 2001', 13, MINT, COND, mid + ' ' + cond('letter-spacing="3"')),

  // ---------- 57-66: variaciones de los favoritos 6, 22, 23 y 27 (2026-11-25) ----------
  // 57. Escudo (6) con TWH Black Ops y franjas (27)
  'shield-ops': () =>
    `<path d="${ESCUDO}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="${ESCUDO_IN}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    cuadros(80, 84, 14, 2, 10) +
    pt('BlackOpsOne-Regular', 'TWH', 60, 150, 162, RED, { fit: 140 }) +
    franjas3(84, 170, 132, 5, 7) +
    ital(150, 207, t(0, 0, '4WD RACE DEPT.', 13, INK, BLACK, mid)) +
    t(150, 226, 'EST. 2001', 10, INK, COND, mid + ' ' + cond('letter-spacing="5"')),

  // 58. Placa de esquinas cortadas (22) con banda a cuadros
  'stamp-checker': () =>
    `<path d="M48 82 H252 L270 100 V200 L252 218 H48 L30 200 V100 Z" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M54 92 H246 L260 106 V194 L246 208 H54 L40 194 V106 Z" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    cuadros(62, 100, 16, 2, 11) +
    ital(150, 172, t(0, 0, 'TWH', 52, INK, BLACK, mid + ' letter-spacing="2"')) +
    `<rect x="100" y="180" width="100" height="5" fill="${RED}"/>` +
    t(150, 200, 'RACE SUPPLY · 4X4', 12, INK, COND, mid + ' ' + cond('letter-spacing="5"')) +
    t(58, 160, '★', 12, INK, 'Arial', mid) + t(242, 160, '★', 12, INK, 'Arial', mid),

  // 59. Sello redondo Speed Shop con bandera inclinada (23)
  'speed-round': () =>
    `<circle cx="150" cy="150" r="128" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<circle cx="150" cy="150" r="96" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    ring('spr', 106, 115, 'TWH SPEED SHOP', 'OFF ROAD · EST. 2001', 18, 13) +
    t(48, 156, '★', 12, MUST, 'Arial', mid) + t(252, 156, '★', 12, MUST, 'Arial', mid) +
    `<g transform="translate(116 92) skewX(-14)">${cuadros(0, 0, 8, 3, 9)}</g>` +
    ital(150, 172, t(0, 0, 'TWH', 54, INK, BLACK, mid)) +
    franjas3(92, 182, 116, 5, 7),

  // 60. Placa horizontal de carrera: TWH Black Ops + franjas en diagonal
  'race-plate-ops': () =>
    `<rect x="24" y="92" width="252" height="116" rx="16" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="33" y="101" width="234" height="98" rx="10" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    t(54, 123, 'EST. 2001', 10, MUST, COND, cond('letter-spacing="5"')) +
    pt('BlackOpsOne-Regular', 'TWH', 60, 54, 168, INK, { anchor: 'start', fit: 128 }) +
    [[ORANGE, 0], [RED, 13], [DRED, 26]].map(([c, d]) => `<path d="M${190 + d} 186 L${210 + d} 114 L${220 + d} 114 L${200 + d} 186 Z" fill="${c}"/>`).join('') +
    t(54, 186, '4X4 RACE DEPT.', 10, INK, COND, cond('letter-spacing="3"')),

  // 61. Banderas a cuadros cruzadas + TWH Racing Team
  'crossed-flags': () => {
    // dos astas cruzadas en X; cada bandera flamea hacia afuera (cuadros deformados por una onda)
    const W = 70, H = 46, C = 7, R = 5, sz = W / C, szy = H / R;
    const onda = (x, y) => [x, y + 5 * Math.sin((x / W) * Math.PI * 1.6) * (0.35 + 0.65 * x / W) - 3 * (x / W)];
    const pto = (x, y, izq) => { const [a, b] = onda(x, y); return r2(izq ? -a : a) + ' ' + r2(b); };
    const celda = (x0, y0, x1, y1, izq) => {
      const top = [], bot = [];
      for (let k = 0; k <= 4; k++) { const x = x0 + (x1 - x0) * k / 4; top.push(pto(x, y0, izq)); bot.unshift(pto(x, y1, izq)); }
      return 'M' + top.join(' L') + ' L' + bot.join(' L') + ' Z';
    };
    const bandera = (ang, izq) => {
      let cuad = '';
      for (let r = 0; r < R; r++) for (let k = 0; k < C; k++) if ((r + k) % 2 === 0) cuad += celda(k * sz, r * szy, (k + 1) * sz, (r + 1) * szy, izq) + ' ';
      return `<g transform="rotate(${ang} 150 128)"><rect x="148" y="52" width="4" height="132" rx="2" fill="${INK}"/><circle cx="150" cy="51" r="4" fill="${INK}"/>` +
        `<g transform="translate(${izq ? 148 : 152} 56)"><path d="${cuad}" fill="${INK}"/><path d="${celda(0, 0, W, H, izq)}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g></g>`;
    };
    return bandera(-28, true) + bandera(28, false) +
      ital(146, 232, t(0, 0, 'TWH', 48, RED, BLACK, mid)) +
      t(153, 254, 'RACING TEAM · 4X4', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
      franjas3(98, 263, 104, 4, 6);
  },

  // 62. Escudo con franjas diagonales por dentro + Speed Shop
  'shield-speed': () =>
    `<defs><clipPath id="shs"><path d="${ESCUDO_IN}"/></clipPath></defs>` +
    `<g clip-path="url(#shs)">` +
    [[ORANGE, 0], [RED, 18], [DRED, 36]].map(([c, d]) => `<path d="M40 ${150 + d} L260 ${96 + d} L260 ${110 + d} L40 ${164 + d} Z" fill="${c}"/>`).join('') +
    cuadros(110, 214, 8, 2, 10) + `</g>` +
    `<path d="${ESCUDO}" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="${ESCUDO_IN}" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` +
    t(150, 92, 'EST. 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
    ital(150, 162, t(0, 0, 'TWH', 58, INK, BLACK, mid + ` stroke="${BG}" stroke-width="6" paint-order="stroke" stroke-linejoin="round"`)) +
    ital(150, 204, t(0, 0, 'SPEED SHOP', 20, MUST, IMPACT, mid + ' letter-spacing="3"')),

  // 63. Placa ancha de esquinas cortadas: TWH Black Ops, Race Dept. · Supply Co.
  'stamp-ops': () =>
    `<path d="M40 90 H260 L278 108 V192 L260 210 H40 L22 192 V108 Z" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<path d="M45 99 H255 L269 113 V187 L255 201 H45 L31 187 V113 Z" fill="none" stroke="${INK}" stroke-width="1.5"/>` +
    t(150, 122, 'THE WHITE HILUX', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
    pt('BlackOpsOne-Regular', 'TWH', 60, 150, 170, INK, { fit: 140 }) +
    `<rect x="104" y="177" width="92" height="5" fill="${RED}"/>` +
    t(150, 195, '4WD RACE DEPT. · SUPPLY CO.', 10, INK, COND, mid + ' ' + cond('letter-spacing="3"')) +
    t(48, 155, '★', 12, INK, 'Arial', mid) + t(252, 155, '★', 12, INK, 'Arial', mid),

  // 64. Credencial Pit Pass
  'pit-pass': () =>
    `<rect x="72" y="38" width="156" height="226" rx="14" fill="none" stroke="${INK}" stroke-width="4"/>` +
    `<rect x="128" y="52" width="44" height="10" rx="5" fill="none" stroke="${INK}" stroke-width="3"/>` +
    `<rect x="72" y="76" width="156" height="36" fill="${RED}"/>` +
    t(150, 102, 'PIT PASS', 22, BG, BLACK, mid + ' letter-spacing="2"') +
    cuadros(72, 112, 16, 2, 9.75) +
    pt('BlackOpsOne-Regular', 'TWH', 50, 150, 190, INK, { fit: 116 }) +
    franjas3(92, 200, 116, 5, 7) +
    t(150, 238, 'ALL ACCESS', 14, MUST, COND, mid + ' ' + cond('letter-spacing="6"')) +
    t(150, 254, '4X4 RACE DEPT.', 10, INK, COND, mid + ' ' + cond('letter-spacing="4"')),

  // 65. Banda inclinada con TWH, cola a cuadros y estela de franjas
  'speed-banner': () =>
    `<g transform="translate(22 118) skewX(-14)">${cuadros(0, 0, 4, 6, 9)}</g>` +
    `<path d="M66 112 H262 L250 174 H54 Z" fill="${RED}"/>` +
    pt('BlackOpsOne-Regular', 'TWH', 52, 156, 162, INK, { fit: 150 }) +
    [[ORANGE, 186, 0], [RED, 196, 12], [DRED, 206, 24]].map(([c, y, d]) => `<path d="M${54 + d} ${y} H${250 - d} L${247 - d} ${y + 5} H${53 + d} Z" fill="${c}"/>`).join('') +
    t(150, 90, 'THE WHITE HILUX', 12, INK, COND, mid + ' ' + cond('letter-spacing="7"')) +
    t(150, 236, 'SPEED &amp; 4X4 · EST. 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="5"')),

  // ---------- 67-76: insignias de carrera con paletas nuevas (2026-11-25) ----------
  // 67. Hexágono Off Road Div. (petróleo + naranjo)
  'hex-badge': () => {
    const hex = (r) => [0, 1, 2, 3, 4, 5].map((k) => { const a = Math.PI / 6 + k * Math.PI / 3; return r2(150 + r * Math.cos(a)) + ' ' + r2(150 + r * Math.sin(a)); }).join(' L');
    return `<path d="M${hex(124)} Z" fill="${PETROL}"/><path d="M${hex(112)} Z" fill="none" stroke="${INK}" stroke-width="2.5"/>` +
      cuadros(96, 92, 12, 2, 9) +
      pt('BlackOpsOne-Regular', 'TWH', 60, 150, 172, INK, { fit: 136 }) +
      franjas3(92, 180, 116, 5, 7, [ORANGE, INK, ORANGE]) +
      t(150, 212, 'OFF ROAD DIV.', 11, INK, COND, mid + ' ' + cond('letter-spacing="5"'));
  },

  // 68. Óvalo verde inglés con dorado
  'oval-gold': () =>
    `<ellipse cx="150" cy="150" rx="128" ry="82" fill="${BRG}"/>` +
    `<ellipse cx="150" cy="150" rx="118" ry="72" fill="none" stroke="${GOLD}" stroke-width="3"/>` +
    `<ellipse cx="150" cy="150" rx="111" ry="65" fill="none" stroke="${GOLD}" stroke-width="1"/>` +
    t(150, 116, 'THE WHITE HILUX', 10, GOLD, COND, mid + ' ' + cond('letter-spacing="4"')) +
    ital(150, 166, t(0, 0, 'TWH', 52, INK, BLACK, mid)) +
    `<path d="M80 176 H220" stroke="${GOLD}" stroke-width="2"/>` +
    t(150, 192, 'RACING · 4X4 · 2001', 9, INK, COND, mid + ' ' + cond('letter-spacing="3"')),

  // 70. Alas de franjas con TWH al centro (mostaza + crema)
  'stripe-wings': () => {
    const ala = (lado) => [0, 1, 2].map((k) => {
      const y = 132 + k * 14, x0 = 150 + lado * 66, x1 = 150 + lado * (148 - k * 22);
      return `<path d="M${x0} ${y} L${x1} ${y - 8} L${x1 - lado * 6} ${y - 1} L${x0} ${y + 7} Z" fill="${k === 1 ? INK : GOLD}"/>`;
    }).join('');
    return ala(-1) + ala(1) +
      `<circle cx="150" cy="144" r="56" fill="${BG}" stroke="${GOLD}" stroke-width="4"/>` +
      pt('BlackOpsOne-Regular', 'TWH', 40, 150, 158, INK, { fit: 84 }) +
      t(150, 232, 'TWH MOTOR CLUB', 16, INK, BLACK, mid + ' letter-spacing="3"') +
      t(150, 252, '4X4 · OFF ROAD · 2001', 10, GOLD, COND, mid + ' ' + cond('letter-spacing="5"'));
  },

  // 72. Placa vertical de esquinas cortadas (arena, oliva y óxido)
  'stamp-tall': () =>
    `<path d="M92 34 H208 L230 56 V244 L208 266 H92 L70 244 V56 Z" fill="none" stroke="${SAND}" stroke-width="5"/>` +
    `<path d="M97 44 H203 L220 61 V239 L203 256 H97 L80 239 V61 Z" fill="none" stroke="${SAND}" stroke-width="1.5"/>` +
    t(150, 80, 'EST. 2001', 11, OLIVE, COND, mid + ' ' + cond('letter-spacing="6"')) +
    pt('BlackOpsOne-Regular', 'TWH', 50, 150, 132, INK, { fit: 116 }) +
    `<rect x="98" y="144" width="104" height="30" fill="${RUST}"/>` +
    pt('BebasNeue-Regular', '4X4', 30, 150, 169, INK, { ls: 8 }) +
    t(150, 200, 'SUPPLY', 18, SAND, COND, mid + ' ' + cond('letter-spacing="8"')) +
    franjas3(100, 214, 100, 4, 7, [SAND, OLIVE, RUST]) +
    t(150, 248, '★', 12, SAND, 'Arial', mid)

};

// ---------- salida ----------
const here = __dirname;
const svgDir = path.join(here, 'svg'), pngDir = path.join(here, 'png');
const webDir = path.join(here, '..', '..', 'web', 'assets', 'logos');
[svgDir, pngDir, webDir].forEach((d) => fs.mkdirSync(d, { recursive: true }));

const only = process.argv.slice(2);
const names = only.length ? only : Object.keys(LOGOS);
const doc = (inner, bg) => `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 300 300">${bg ? `<rect id="fondo" width="300" height="300" fill="${BG}"/>` : ''}${inner}</svg>\n`;

const edgeCandidates = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'];
const edge = edgeCandidates.find((p) => fs.existsSync(p));

for (const n of names) {
  if (!LOGOS[n]) { console.log('No existe el logo:', n); continue; }
  const inner = LOGOS[n]();
  fs.writeFileSync(path.join(svgDir, n + '.svg'), doc(inner, true));          // con fondo, para ver
  fs.writeFileSync(path.join(webDir, n + '.svg'), doc(inner, false));         // sin fondo, para la tienda
  // versión para prendas claras (blanco/arena): tinta oscura
  fs.writeFileSync(path.join(webDir, n + '-claro.svg'), doc(inner.split(INK).join('#1C1D1A').split(BG).join('#F2F1EC'), false));
  if (edge) {
    execFileSync(edge, ['--headless=new', '--edge-skip-compat-layer-relaunch', '--disable-gpu', '--hide-scrollbars', '--window-size=1000,1000',
      '--screenshot=' + path.join(pngDir, n + '.png'), 'file:///' + path.join(svgDir, n + '.svg').replace(/\\/g, '/')], { stdio: 'ignore' });
  }
  console.log('ok', n);
}

// Logo oficial (Race Dept. con TWH Black Ops) recortado para el encabezado de la tienda, portada, pie, panel y configurador
const off = LOGOS['race-dept-ops']();
const crop = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 62 290 200" width="290" height="200">${inner}</svg>
`;
fs.writeFileSync(path.join(webDir, 'logo-oficial.svg'), crop(off));
fs.writeFileSync(path.join(webDir, 'logo-oficial-claro.svg'), crop(off.split(INK).join('#1C1D1A')));

// Logo del encabezado: TWH + franjas, sin letras chicas (se leen mal en tamaño pequeño)
const hdr = ital(150, 150, t(0, 0, 'TWH', 100, INK, BLACK, mid)) +
  `<path d="M30 166 H270 L262 172 H30 Z" fill="${ORANGE}"/><path d="M30 176 H260 L252 182 H30 Z" fill="${RED}"/><path d="M30 186 H250 L242 192 H30 Z" fill="${DRED}"/>`;
fs.writeFileSync(path.join(webDir, 'logo-header.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 74 266 122" width="266" height="122">${hdr}</svg>
`);

// Logo oficial horizontal (encabezado de la tienda)
const shopH = ital(14, 58, t(0, 0, 'THE WHITE HILUX', 50, INK, BLACK, 'textLength="510" lengthAdjust="spacingAndGlyphs"')) +
  [ORANGE, RED, DRED].map((c, k) => `<path d="M8 ${74 + k * 9} H${372 - k * 10} L${366 - k * 10} ${80 + k * 9} H8 Z" fill="${c}"/>`).join('') +
  `<path d="M392 72 H556 L546 104 H382 Z" fill="${MUST}"/>` + ital(470, 97, t(0, 0, 'CL SHOP', 24, BG, BLACK, mid + ' letter-spacing="4"'));
fs.writeFileSync(path.join(webDir, 'logo-shop.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 8 566 106" width="566" height="106">${shopH}</svg>
`);
fs.writeFileSync(path.join(webDir, 'logo-header-claro.svg'), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="18 74 266 122" width="266" height="122">${hdr.split(INK).join('#1C1D1A')}</svg>
`);

// Hoja con todos los logos juntos
const all = Object.keys(LOGOS);
const cols = 4, cell = 300, rows = Math.ceil(all.length / cols);
let sheet = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (cell + 30)}" viewBox="0 0 ${cols * cell} ${rows * (cell + 30)}"><rect width="100%" height="100%" fill="#2A2B28"/>`;
all.forEach((n, i) => {
  const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + 30);
  sheet += `<g transform="translate(${x + 6} ${y + 6}) scale(${(cell - 12) / 300})"><rect width="300" height="300" fill="${BG}"/>${LOGOS[n]().replace(/id="(\w+)"/g, `id="$1${i}"`).replace(/href="#(\w+)"/g, `href="#$1${i}"`).replace(/url\(#(\w+)\)/g, `url(#$1${i})`)}</g>`;
  sheet += `<text x="${x + cell / 2}" y="${y + cell + 18}" text-anchor="middle" font-family="Consolas, monospace" font-size="14" fill="#CFCCC2">${i + 1}. ${n}</text>`;
});
sheet += '</svg>\n';
fs.writeFileSync(path.join(here, '_todos.svg'), sheet);
if (edge) {
  execFileSync(edge, ['--headless=new', '--edge-skip-compat-layer-relaunch', '--disable-gpu', '--hide-scrollbars', `--window-size=${cols * cell},${rows * (cell + 30)}`,
    '--screenshot=' + path.join(here, '_todos.png'), 'file:///' + path.join(here, '_todos.svg').replace(/\\/g, '/')], { stdio: 'ignore' });
}
console.log('Hoja de contacto: disenos/logos/_todos.png');
