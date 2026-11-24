// Genera los logos TWH como archivos: svg/*.svg (vectorial) y png/*.png (vista previa 1000 px).
// Uso:  node disenos/logos/generar.js            -> todos
//       node disenos/logos/generar.js rally-stripes tire   -> solo esos
// Para cambiar un logo: edita su función en LOGOS y vuelve a correr el script.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const BG = '#1B1C1A', INK = '#F2F0E8', ORANGE = '#F2A541', RED = '#E4572E', DRED = '#B3202A', MUST = '#E39B2D', OLIVE = '#7A8450';
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
function pt(file, text, size, x, y, fill, o = {}) {
  const opentype = require('opentype.js');
  const font = FONT_CACHE[file] || (FONT_CACHE[file] = opentype.loadSync(path.join(__dirname, '..', 'fuentes', file + '.ttf')));
  const k = size / font.unitsPerEm;
  const glyphs = font.stringToGlyphs(text);
  let cx = 0, d = '';
  glyphs.forEach((g, i) => {
    d += g.getPath(cx, 0, size).toPathData(2);
    cx += g.advanceWidth * k + (o.ls || 0);
    if (i < glyphs.length - 1) cx += font.getKerningValue(g, glyphs[i + 1]) * k;
  });
  const natural = cx - (o.ls || 0);
  const sx = o.w ? o.w / natural : 1;
  const width = natural * sx;
  const anchor = o.anchor || 'middle';
  const x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const sk = o.skew ? ` skewX(${-o.skew})` : '';
  return `<g transform="translate(${r2(x0)} ${r2(y)})${sk} scale(${r2(sx * 1000) / 1000} 1)"><path d="${d}" fill="${fill}"/></g>`;
}

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

  // 3. Diff Lock: insignia con el símbolo real del tablero (ejes vistos desde arriba, diferencial trasero bloqueado)
  'diff-lock': () => {
    const axle = (y, big) =>
      `<rect x="92" y="${y - 17}" width="18" height="34" rx="4" fill="${MUST}"/><rect x="190" y="${y - 17}" width="18" height="34" rx="4" fill="${MUST}"/>` +
      `<rect x="110" y="${y - 3.5}" width="80" height="7" fill="${MUST}"/>` +
      (big
        ? `<circle cx="150" cy="${y}" r="15" fill="${BG}" stroke="${MUST}" stroke-width="6"/><path d="M143 ${y - 7} L157 ${y + 7} M157 ${y - 7} L143 ${y + 7}" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/>`
        : `<circle cx="150" cy="${y}" r="8" fill="${MUST}"/>`);
    return `<circle cx="150" cy="150" r="138" fill="none" stroke="${INK}" stroke-width="6"/><circle cx="150" cy="150" r="126" fill="none" stroke="${INK}" stroke-width="2"/>` +
      ring('dl', 102, 114, 'REAR DIFF LOCK', 'TWH · 4X4 · CHILE', 21, 16) +
      t(37, 157, '★', 16, INK, 'Arial', mid) + t(263, 157, '★', 16, INK, 'Arial', mid) +
      `<rect x="146.5" y="112" width="7" height="62" fill="${MUST}"/>` + axle(110, false) + axle(188, true);
  },

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
    for (let r = 0; r < 3; r++) for (let k = 0; k < 16; k++) if ((r + k) % 2 === 0) ch += `<rect x="${70 + k * 10}" y="${88 + r * 10}" width="10" height="10" fill="${INK}"/>`;
    return `<path d="M150 36 L250 62 L250 168 Q250 236 150 268 Q50 236 50 168 L50 62 Z" fill="none" stroke="${INK}" stroke-width="7" stroke-linejoin="round"/>` +
      `<path d="M150 50 L238 73 L238 166 Q238 225 150 254 Q62 225 62 166 L62 73 Z" fill="none" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>` + ch +
      ital(150, 182, t(0, 0, 'TWH', 58, RED, BLACK, mid)) +
      t(150, 210, '4X4 TEAM', 18, INK, BLACK, mid + ' letter-spacing="2"') +
      t(150, 234, 'EST. 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
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

  // 9. Off Road Recovery: dos planchas de rescate cruzadas (id road-sign se mantiene)
  'road-sign': () => {
    const board = (rot, col) => {
      let studs = '';
      for (let k = 0; k < 7; k++) studs += `<rect x="-15" y="${-74 + k * 21}" width="30" height="7" rx="2" fill="${BG}" opacity=".55"/>`;
      return `<g transform="translate(150 118) rotate(${rot})"><rect x="-24" y="-86" width="48" height="172" rx="12" fill="${col}"/>` +
        `<rect x="-12" y="-80" width="24" height="10" rx="5" fill="${BG}"/>` + studs + '</g>';
    };
    return t(150, 34, 'TWH', 18, INK, BLACK, mid + ' letter-spacing="6"') +
      board(-38, ORANGE) + board(38, RED) +
      `<rect x="40" y="214" width="220" height="6" fill="${INK}"/>` +
      t(150, 252, 'OFF ROAD', 30, INK, BLACK, mid + ' letter-spacing="2"') +
      t(150, 282, 'RECOVERY TEAM · CHILE', 13, MUST, COND, mid + ' ' + cond('letter-spacing="5"'));
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

  // 12. Placa de puerta de rally (estilo Dakar)
  'rally-plate': () => {
    let ch = '';
    for (let r = 0; r < 2; r++) for (let k = 0; k < 22; k++) if ((r + k) % 2 === 0) ch += `<rect x="${40 + k * 10}" y="${246 + r * 7}" width="10" height="7" fill="${INK}"/>`;
    return `<rect x="40" y="40" width="220" height="196" rx="14" fill="${INK}"/>` +
      `<path d="M40 54 Q40 40 54 40 H246 Q260 40 260 54 V92 H40 Z" fill="${RED}"/>` +
      `<rect x="40" y="92" width="220" height="6" fill="${ORANGE}"/>` +
      ital(150, 76, t(0, 0, 'TWH RALLY', 24, INK, BLACK, mid + ' letter-spacing="2"')) +
      t(150, 222, '01', 150, BG, IMPACT, mid) + ch +
      t(150, 290, '4X4 · SINCE 2001 · CHILE', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

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
  // 17. Cruz chopper (estilo West Coast Choppers): hojas claras recortadas por el marco, brazos oscuros, palabras verticales y palabra gótica al centro
  'iron-cross': () => {
    const c = 150, H = 122, I = H - 8, T = H + 6;
    const leaf = (sx, sy) => {
      const X = (v) => r2(c + sx * v), Y = (v) => r2(c + sy * v);
      return `M${X(13)} ${Y(13)} C${X(0.55 * H)} ${Y(4)} ${X(H - 2)} ${Y(0.42 * H)} ${X(T)} ${Y(T)} C${X(0.42 * H)} ${Y(H - 2)} ${X(4)} ${Y(0.55 * H)} ${X(13)} ${Y(13)} Z`;
    };
    const vert = (w, y0, len) => `<text transform="translate(${c - 13} ${y0}) rotate(90)" font-family="${BLACK}" font-size="34" fill="${INK}" textLength="${len}" lengthAdjust="spacingAndGlyphs">${w}</text>`;
    return `<defs><clipPath id="wcc"><rect x="${c - I}" y="${c - I}" width="${2 * I}" height="${2 * I}" rx="12"/></clipPath></defs>` +
      `<rect x="${c - H + 2}" y="${c - H + 2}" width="${2 * H - 4}" height="${2 * H - 4}" rx="16" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<g clip-path="url(#wcc)"><path d="${leaf(-1, -1)} ${leaf(1, -1)} ${leaf(-1, 1)} ${leaf(1, 1)}" fill="${INK}"/></g>` +
      vert('WHITE', c - I + 2, 80) + vert('HILUX', c + 34, 80) +
      `<g transform="translate(${c} ${c + 21}) scale(1 1.45)"><text x="0" y="0" text-anchor="middle" font-family="'Old English Text MT', 'Times New Roman', serif" font-weight="700" font-size="54" fill="${INK}" stroke="${BG}" stroke-width="7" paint-order="stroke" stroke-linejoin="round" textLength="252" lengthAdjust="spacingAndGlyphs">Off Road</text></g>`;
  },

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

  // 22. Plano técnico del neumático (estilo dibujo de ingeniería)
  'tire-blueprint': () => {
    let grid = '';
    for (let v = 30; v <= 270; v += 20) grid += `<path d="M${v} 24 V236 M30 ${v - 6} H270" stroke="${INK}" stroke-opacity=".12" stroke-width="1"/>`;
    let lugs = '';
    for (let k = 0; k < 28; k++) {
      const a = k * Math.PI * 2 / 28, x1 = 130 + 86 * Math.cos(a), y1 = 128 + 86 * Math.sin(a), x2 = 130 + 96 * Math.cos(a), y2 = 128 + 96 * Math.sin(a);
      lugs += `<path d="M${r2(x1)} ${r2(y1)} L${r2(x2)} ${r2(y2)}" stroke="${INK}" stroke-width="5"/>`;
    }
    let nuts = '';
    for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; nuts += `<circle cx="${r2(130 + 22 * Math.cos(a))}" cy="${r2(128 + 22 * Math.sin(a))}" r="3.5" fill="none" stroke="${INK}" stroke-width="1.5"/>`; }
    const arrow = (x, y, dir) => `<path d="M${x} ${y} l-4 ${dir * 8} h8 Z" fill="${MUST}"/>`;
    return grid +
      `<circle cx="130" cy="128" r="92" fill="none" stroke="${INK}" stroke-width="2.5"/>` + lugs +
      `<circle cx="130" cy="128" r="74" fill="none" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 3"/>` +
      `<circle cx="130" cy="128" r="48" fill="none" stroke="${INK}" stroke-width="2.5"/><circle cx="130" cy="128" r="12" fill="none" stroke="${INK}" stroke-width="2"/>` + nuts +
      `<path d="M252 30 V226 M244 30 H260 M244 226 H260" stroke="${MUST}" stroke-width="1.5"/>` + arrow(252, 30, 1) + arrow(252, 226, -1) +
      `<text transform="translate(266 128) rotate(90)" text-anchor="middle" font-family="${COND}" font-weight="700" style="font-stretch:condensed" font-size="16" fill="${MUST}">35"</text>` +
      `<path d="M82 196 H178 M82 190 V202 M178 190 V202" stroke="${MUST}" stroke-width="1.5"/>` + t(130, 214, '15" RIM', 12, MUST, COND, mid + ' ' + cond('letter-spacing="2"')) +
      `<rect x="30" y="242" width="240" height="40" fill="none" stroke="${INK}" stroke-width="1.5"/><path d="M190 242 V282" stroke="${INK}" stroke-width="1.5"/>` +
      t(40, 260, 'TWH ENGINEERING', 14, INK, COND, cond('letter-spacing="3"')) + t(40, 275, 'MUD TERRAIN · 35X12.50', 9, INK, COND, cond('letter-spacing="2"')) +
      t(230, 260, 'DWG', 9, INK, COND, mid + ' ' + cond('letter-spacing="2"')) + t(230, 276, '4X4-01', 12, MUST, COND, mid + ' ' + cond());
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
      ital(150, 176, t(0, 0, 'TWH', 72, INK, BLACK, mid)) +
      ital(150, 214, t(0, 0, 'SPEED SHOP', 30, MUST, IMPACT, mid + ' letter-spacing="5"')) +
      `<path d="M60 228 H250 L246 233 H56 Z" fill="${ORANGE}"/><path d="M60 237 H244 L240 242 H56 Z" fill="${RED}"/>` +
      t(150, 268, 'OFF ROAD · CHILE · 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 24. Off Road Dept. estilo Troy Lee: letras altas con sombra roja desplazada
  'tall-stack': () =>
    t(150, 56, 'THE WHITE HILUX', 13, INK, COND, mid + ' ' + cond('letter-spacing="7"')) +
    t(156, 186, 'TWH', 150, RED, IMPACT, mid + ' textLength="214" lengthAdjust="spacingAndGlyphs"') +
    t(150, 180, 'TWH', 150, INK, IMPACT, mid + ' textLength="214" lengthAdjust="spacingAndGlyphs" stroke="' + BG + '" stroke-width="3" paint-order="stroke" stroke-linejoin="round"') +
    `<rect x="43" y="196" width="214" height="4" fill="${INK}"/>` +
    ital(150, 232, t(0, 0, 'OFF ROAD DEPT.', 26, INK, BLACK, mid + ' letter-spacing="1"')) +
    t(150, 258, '4X4 &amp; SPEED', 13, RED, COND, mid + ' ' + cond('letter-spacing="8"')),

  // 26. Sol con rayos retro
  'sunburst': () => {
    let rays = '';
    for (let k = 0; k < 24; k++) {
      const a0 = k * Math.PI / 12, a1 = a0 + Math.PI / 24;
      rays += `<path d="M150 140 L${r2(150 + 160 * Math.cos(a0))} ${r2(140 + 160 * Math.sin(a0))} L${r2(150 + 160 * Math.cos(a1))} ${r2(140 + 160 * Math.sin(a1))} Z" fill="${k % 2 ? ORANGE : MUST}"/>`;
    }
    return `<defs><clipPath id="sb"><circle cx="150" cy="140" r="112"/></clipPath></defs>` +
      `<g clip-path="url(#sb)">${rays}</g>` +
      `<circle cx="150" cy="140" r="112" fill="none" stroke="${INK}" stroke-width="5"/>` +
      `<text x="150" y="166" text-anchor="middle" font-family="${BLACK}" font-size="76" fill="${INK}" stroke="${BG}" stroke-width="12" paint-order="stroke" stroke-linejoin="round">TWH</text>` +
      `<rect x="70" y="232" width="160" height="34" fill="${INK}"/>` +
      t(150, 256, 'OFF ROAD', 20, BG, BLACK, mid + ' letter-spacing="4"') +
      t(150, 290, 'SINCE 2001 · CHILE', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },


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
  // 28. Curvas de nivel (mapa topográfico) + TWH
  'topo-explorers': () => {
    let lines = '';
    for (let k = 0; k < 7; k++) {
      let d = '';
      for (let i = 0; i <= 72; i++) {
        const a = (i / 72) * Math.PI * 2;
        const r = 26 + k * 13 + 5 * Math.sin(3 * a + k * 0.7) + 3.5 * Math.cos(5 * a - k * 1.3) + 2 * Math.sin(2 * a + k);
        d += (i ? 'L' : 'M') + r2(150 + r * Math.cos(a) * 1.18) + ' ' + r2(132 + r * Math.sin(a) * 0.9) + ' ';
      }
      lines += `<path d="${d}Z" fill="none" stroke="${k === 3 ? MUST : INK}" stroke-width="${k === 3 ? 2.5 : 1.6}" stroke-opacity="${k === 3 ? 1 : 0.55}"/>`;
    }
    return `<defs><clipPath id="topo"><rect x="34" y="40" width="232" height="184" rx="10"/></clipPath></defs>` +
      `<g clip-path="url(#topo)">${lines}</g>` +
      `<rect x="34" y="40" width="232" height="184" rx="10" fill="none" stroke="${INK}" stroke-width="4"/>` +
      `<rect x="88" y="104" width="124" height="58" rx="4" fill="${BG}"/>` +
      pt('BebasNeue-Regular', 'TWH', 66, 150, 156, INK, { ls: 4 }) +
      pt('BebasNeue-Regular', 'OFF ROAD EXPLORERS', 26, 150, 258, INK, { ls: 3 }) +
      t(150, 280, '33°S · 70°W · CHILE', 12, MUST, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

  // 29. Placa ovalada de competición (4X4)
  'rally-raid': () => {
    let ch = '';
    for (let r = 0; r < 2; r++) for (let k = 0; k < 18; k++) if ((r + k) % 2 === 0) ch += `<rect x="${51 + k * 11}" y="${232 + r * 9}" width="11" height="9" fill="${INK}"/>`;
    return t(150, 58, 'TWH · RALLY RAID · 4X4', 14, INK, COND, mid + ' ' + cond('letter-spacing="6"')) +
      `<ellipse cx="150" cy="146" rx="112" ry="72" fill="${INK}"/>` +
      `<ellipse cx="150" cy="146" rx="102" ry="62" fill="none" stroke="${BG}" stroke-width="2.5"/>` +
      pt('RacingSansOne-Regular', '4X4', 92, 150, 182, RED, { w: 170 }) +
      pt('BlackOpsOne-Regular', 'TWH', 22, 150, 112, BG, { ls: 4 }) +
      ch + t(150, 278, 'OFF ROAD · CHILE · 2001', 12, INK, COND, mid + ' ' + cond('letter-spacing="6"'));
  },

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
    t(150, 250, '12.000 LBS · PULL HARD', 12, MUST, COND, mid + ' ' + cond('letter-spacing="5"'))
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
    execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1000,1000',
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
  execFileSync(edge, ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--window-size=${cols * cell},${rows * (cell + 30)}`,
    '--screenshot=' + path.join(here, '_todos.png'), 'file:///' + path.join(here, '_todos.svg').replace(/\\/g, '/')], { stdio: 'ignore' });
}
console.log('Hoja de contacto: disenos/logos/_todos.png');
