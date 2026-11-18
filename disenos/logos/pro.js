// Logos "pro" de TWH: insignias vintage y deporte moderno, con tipografías libres convertidas a trazos
// (se ven igual en cualquier dispositivo e imprenta) y volumen con degradados (metal, hueso, fuego, vidrio).
// Tipografías (disenos/fuentes, licencias OFL / Apache, uso comercial permitido):
//   Rye (vintage biker) · Yellowtail (manuscrita retro) · Bebas Neue (condensada) · Alfa Slab One (pesada)
// Lo carga generar.js:  Object.assign(LOGOS, require('./pro.js')(C))
const path = require('path');
const opentype = require('opentype.js');

module.exports = function (C) {
  const { INK, BG, ORANGE, RED, DRED, MUST } = C;
  // Materiales físicos (hueso, metal, cerámica, plumón) y sus contornos NO se invierten en la versión para prenda clara:
  // usan estos tonos, distintos de INK/BG (que sí se invierten: textos, aros, fondos).
  const LIGHT = '#F3F1EA', DARK = '#1A1B19';
  const F = {};
  const fdir = path.join(__dirname, '..', 'fuentes');
  const font = (k, file) => (F[k] = F[k] || opentype.loadSync(path.join(fdir, file)));
  const RYE = () => font('rye', 'Rye-Regular.ttf');
  const SCRIPT = () => font('script', 'Yellowtail-Regular.ttf');
  const BEBAS = () => font('bebas', 'BebasNeue-Regular.ttf');
  const SLAB = () => font('slab', 'AlfaSlabOne-Regular.ttf');
  const r2 = (n) => Math.round(n * 100) / 100;

  // ---------- texto como trazo ----------
  function glyphs(f, str, size, spacing) {
    const out = [];
    let x = 0;
    const gs = f.stringToGlyphs(str);
    gs.forEach((g, i) => {
      const adv = (g.advanceWidth * size) / f.unitsPerEm;
      const kern = i < gs.length - 1 ? (f.getKerningValue(g, gs[i + 1]) * size) / f.unitsPerEm : 0;
      out.push({ g, x, adv });
      x += adv + kern + spacing;
    });
    return { list: out, width: x - spacing };
  }
  // opts: anchor (start|middle|end), fill, spacing, stroke, sw (grosor contorno), skew (grados), width (forzar ancho)
  function txt(f, str, size, x, y, o = {}) {
    let { list, width } = glyphs(f, str, size, o.spacing || 0);
    let sx = 1;
    if (o.width) { sx = o.width / width; width = o.width; }
    const x0 = o.anchor === 'start' ? 0 : o.anchor === 'end' ? -width : -width / 2;
    const d = list.map(({ g, x: gx }) => g.getPath(gx, 0, size).toPathData(2)).join('');
    const tr = `translate(${r2(x)} ${r2(y)})${o.skew ? ` skewX(${o.skew})` : ''} translate(${r2(x0)} 0)${sx !== 1 ? ` scale(${r2(sx * 1000) / 1000} 1)` : ''}`;
    const stroke = o.stroke ? ` stroke="${o.stroke}" stroke-width="${o.sw || 3}" stroke-linejoin="round" paint-order="stroke"` : '';
    return `<path transform="${tr}" d="${d}" fill="${o.fill || INK}"${stroke}/>`;
  }
  // texto curvo en un círculo: arriba se lee de izquierda a derecha por fuera; abajo (bottom) también, con la base hacia afuera
  function arc(f, str, size, cx, cy, r, o = {}) {
    const { list, width } = glyphs(f, str, size, o.spacing || 0);
    const fill = o.fill || INK;
    return list.map(({ g, x, adv }) => {
      const s = (x + adv / 2 - width / 2) / r;
      const th = o.bottom ? Math.PI / 2 - s : -Math.PI / 2 + s;
      const px = cx + r * Math.cos(th), py = cy + r * Math.sin(th);
      const rot = o.bottom ? (th * 180) / Math.PI - 90 : (th * 180) / Math.PI + 90;
      return `<path transform="translate(${r2(px)} ${r2(py)}) rotate(${r2(rot)}) translate(${r2(-adv / 2)} 0)" d="${g.getPath(0, 0, size).toPathData(2)}" fill="${fill}"/>`;
    }).join('');
  }

  // ---------- degradados (volumen) ----------
  const defs = (...g) => `<defs>${g.join('')}</defs>`;
  const lin = (id, stops, x2 = 1, y2 = 0) => `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const rad = (id, stops, cx = .5, cy = .5, r = .5) => `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}"/>`).join('')}</radialGradient>`;
  // metal cilíndrico: borde oscuro, brillo blanco a 1/3, cuerpo gris, reflejo suave al otro lado
  const METAL = (id) => lin(id, [[0, '#4A4C48'], [.14, '#B9B8B0'], [.3, LIGHT], [.42, '#D8D6CE'], [.66, '#7E807A'], [.86, '#A5A59E'], [1, '#3E403C']]);
  const METALV = (id) => lin(id, [[0, '#E9E7DF'], [.35, LIGHT], [.7, '#8E8F89'], [1, '#4A4C48']], 0, 1);
  const BONE = (id) => rad(id, [[0, LIGHT], [.62, '#E3DFD2'], [1, '#A8A296']], .42, .38, .7);
  const FIRE = (id) => lin(id, [[0, '#FFE08A'], [.35, ORANGE], [.7, RED], [1, DRED]], 0, 1);
  const GLASS = (id) => lin(id, [[0, '#F7C468'], [.45, MUST], [1, '#8A4A12']], 1, 1);
  const PAINT = (id, a, b) => lin(id, [[0, a], [.35, b], [1, '#3A1410']], 1, 1);

  // ---------- piezas ----------
  const OUT = (w = 3) => `stroke="${DARK}" stroke-width="${w}" stroke-linejoin="round"`;
  // pistón con biela (centrado en el pasador, corona arriba). m = id del degradado metal
  function piston(m) {
    const bolt = (x) => `<path d="M${x - 5} 79 h10 v13 h-10 z" fill="url(#${m})" ${OUT(2)}/><path d="M${x - 5} 92 h10 l-1 4 h-8 z" fill="#5A5C57" ${OUT(1.5)}/>`;
    return (
      // biela en I
      `<path d="M-10 -6 L-13 50 Q0 55 13 50 L10 -6 Z" fill="url(#${m})" ${OUT(2.6)}/>` +
      `<path d="M-3.5 2 L-4.5 46 H4.5 L3.5 2 Z" fill="#55574F"/>` +
      // cabeza de biela con tapa y pernos
      `<circle cx="0" cy="70" r="23" fill="url(#${m})" ${OUT(2.6)}/><circle cx="0" cy="70" r="13" fill="${DARK}"/><circle cx="0" cy="70" r="13" fill="none" stroke="#8E8F89" stroke-width="2"/>` +
      `<path d="M-23 72 H23" ${OUT(2.6)}/>` + bolt(-17) + bolt(17) +
      // falda
      `<path d="M-31 -30 H31 L29 10 Q0 18 -29 10 Z" fill="url(#${m})" ${OUT(3)}/>` +
      `<path d="M-24 -27 V8 M24 -27 V8" stroke="#5A5C57" stroke-width="1.2" opacity=".6"/>` +
      // pasador (bulón) con su alojamiento
      `<circle cx="0" cy="-9" r="12" fill="#3E403C" ${OUT(2)}/><circle cx="0" cy="-9" r="8" fill="url(#${m})"/><circle cx="0" cy="-9" r="3.4" fill="${DARK}"/>` +
      // corona y anillos
      `<path d="M-33 -58 Q0 -69 33 -58 V-30 H-33 Z" fill="url(#${m})" ${OUT(3)}/>` +
      [-51, -44, -37].map((y) => `<path d="M-33 ${y} H33" stroke="${DARK}" stroke-width="2.6"/><path d="M-33 ${y + 1.8} H33" stroke="#FFFFFF" stroke-width=".8" opacity=".55"/>`).join('') +
      `<path d="M-26 -62 Q-4 -67 18 -64" stroke="#FFFFFF" stroke-width="2" fill="none" opacity=".8"/>`
    );
  }
  // bujía (terminal arriba, electrodo abajo)
  function bujia(m, cer) {
    let threads = '';
    for (let y = 2; y < 70; y += 5) threads += `<path d="M-12 ${y} L12 ${y + 3.4}" stroke="${DARK}" stroke-width="1.8"/>`;
    let ribs = '';
    for (let k = 0; k < 5; k++) ribs += `<path d="M${-11 + k * .5} ${-74 + k * 9} H${11 - k * .5}" stroke="#9A968A" stroke-width="2.4"/>`;
    return `<path d="M-5 -110 h10 v8 h-10 z M-7 -102 h14 v14 h-14 z" fill="url(#${m})" ${OUT(2)}/>` +
      `<path d="M-10 -88 L-14 -32 H14 L10 -88 Z" fill="url(#${cer})" ${OUT(2.6)}/>` + ribs +
      `<path d="M-6 -86 L-8 -34" stroke="#FFFFFF" stroke-width="2" opacity=".8"/>` +
      `<path d="M-21 -32 H21 L25 -21 L21 -10 H-21 L-25 -21 Z" fill="url(#${m})" ${OUT(2.6)}/>` +
      `<path d="M-8 -32 V-10 M8 -32 V-10" stroke="${DARK}" stroke-width="1.6"/>` +
      `<rect x="-16" y="-10" width="32" height="7" fill="#7E807A" ${OUT(2)}/>` +
      `<rect x="-12" y="-3" width="24" height="75" fill="url(#${m})" ${OUT(2.6)}/>` + threads +
      `<path d="M-2 72 V84 M-9 72 V92 H5" fill="none" stroke="#B9B8B0" stroke-width="4" stroke-linecap="round"/>`;
  }
  // cinta con pliegues y texto
  function ribbon(y, w, label, f, size, fill = MUST, txtFill = BG) {
    const x0 = 150 - w / 2, x1 = 150 + w / 2, h = 30;
    return `<path d="M${x0 - 26} ${y + 6} H${x0 + 8} V${y + h + 6} H${x0 - 26} L${x0 - 16} ${y + 6 + h / 2} Z" fill="${DRED}" ${OUT(2.6)}/>` +
      `<path d="M${x1 + 26} ${y + 6} H${x1 - 8} V${y + h + 6} H${x1 + 26} L${x1 + 16} ${y + 6 + h / 2} Z" fill="${DRED}" ${OUT(2.6)}/>` +
      `<path d="M${x0} ${y + h} L${x0 + 8} ${y + h + 6} V${y + h} Z M${x1} ${y + h} L${x1 - 8} ${y + h + 6} V${y + h} Z" fill="#3A1410"/>` +
      `<path d="M${x0} ${y} Q150 ${y - 8} ${x1} ${y} V${y + h} Q150 ${y + h - 8} ${x0} ${y + h} Z" fill="${fill}" ${OUT(2.6)}/>` +
      txt(f, label, size, 150, y + h / 2 + size * .36 - 3, { fill: txtFill, spacing: 1 });
  }
  const star = (x, y, r, fill = INK) => {
    let d = '';
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5, rr = k % 2 ? r * .42 : r;
      d += (k ? 'L' : 'M') + r2(x + rr * Math.cos(a)) + ' ' + r2(y + rr * Math.sin(a));
    }
    return `<path d="${d}Z" fill="${fill}"/>`;
  };
  const rings = (r1, r2_, w = 4) => `<circle cx="150" cy="150" r="${r1}" fill="${BG}" stroke="${INK}" stroke-width="${w}"/><circle cx="150" cy="150" r="${r2_}" fill="none" stroke="${INK}" stroke-width="1.6"/>`;

  // ---------- calavera con casco y antiparras ----------
  function skullRider(ids) {
    const { bone, paint, glass, metal } = ids;
    return (
      // mandíbula
      `<path d="M112 176 Q114 212 134 220 Q150 226 166 220 Q186 212 188 176 Q150 186 112 176 Z" fill="url(#${bone})" ${OUT(3)}/>` +
      [124, 136, 148, 160, 172].map((x, i) => `<path d="M${x} ${188 + Math.abs(i - 2) * -1} q4 14 8 0" fill="${LIGHT}" ${OUT(1.6)}/>`).join('') +
      // cráneo (cara)
      `<path d="M98 122 Q96 162 112 178 Q150 190 188 178 Q204 162 202 122 Z" fill="url(#${bone})" ${OUT(3.2)}/>` +
      // pómulos y sombras grabadas
      `<path d="M104 150 Q112 168 126 172 M196 150 Q188 168 174 172" stroke="#9C968A" stroke-width="2" fill="none"/>` +
      [0, 1, 2, 3].map((k) => `<path d="M${102 + k * 3} ${132 + k * 3} q-1 16 8 ${26 - k * 3}" stroke="#8A8478" stroke-width="1" fill="none"/><path d="M${198 - k * 3} ${132 + k * 3} q1 16 -8 ${26 - k * 3}" stroke="#8A8478" stroke-width="1" fill="none"/>`).join('') +
      // cuencas con ceño (actitud)
      `<path d="M108 136 Q118 126 140 134 Q146 140 142 152 Q134 166 120 162 Q106 156 108 136 Z" fill="${DARK}"/>` +
      `<path d="M192 136 Q182 126 160 134 Q154 140 158 152 Q166 166 180 162 Q194 156 192 136 Z" fill="${DARK}"/>` +
      `<circle cx="127" cy="148" r="3" fill="${MUST}"/><circle cx="173" cy="148" r="3" fill="${MUST}"/>` +
      // nariz
      `<path d="M150 154 L141 172 Q150 176 159 172 Z" fill="${DARK}"/><path d="M150 160 V173" stroke="#B4AEA1" stroke-width="1.6"/>` +
      // dientes superiores
      `<path d="M120 178 Q150 186 180 178 V190 Q150 196 120 190 Z" fill="${LIGHT}" ${OUT(2)}/>` +
      [129, 138, 146, 154, 162, 171].map((x) => `<path d="M${x} 180 V193" stroke="${DARK}" stroke-width="1.8"/>`).join('') +
      // casco (calota con brillo y borde)
      `<path d="M88 126 Q86 58 150 54 Q214 58 212 126 Q150 116 88 126 Z" fill="url(#${paint})" ${OUT(3.2)}/>` +
      `<path d="M104 92 Q116 66 150 62" stroke="#FFFFFF" stroke-width="5" stroke-linecap="round" fill="none" opacity=".55"/>` +
      `<path d="M86 124 Q150 112 214 124 L216 132 Q150 120 84 132 Z" fill="#3A1410" ${OUT(2)}/>` +
      // antiparras sobre el casco
      `<path d="M84 98 Q150 80 216 98 L216 106 Q150 90 84 106 Z" fill="#3E403C" ${OUT(2)}/>` +
      `<g>${[[122, 96], [178, 96]].map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="25" ry="17" fill="url(#${metal})" ${OUT(2.6)}/><ellipse cx="${x}" cy="${y}" rx="18" ry="11.5" fill="url(#${glass})" ${OUT(2)}/><path d="M${x - 11} ${y - 4} Q${x - 4} ${y - 9} ${x + 4} ${y - 8}" stroke="#FFFFFF" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>`).join('')}</g>` +
      `<rect x="144" y="90" width="12" height="10" rx="2" fill="url(#${metal})" ${OUT(2)}/>`
    );
  }

  const L = {};

  // 32. Calavera motociclista + pistones cruzados (grabado con volumen)
  L['piston-skull'] = () => {
    const id = { metal: 'psM', bone: 'psB', paint: 'psP', glass: 'psG' };
    const rod = (rot) => `<g transform="translate(150 168) rotate(${rot}) translate(0 -30) scale(1.02)">${piston(id.metal)}</g>`;
    return defs(METAL(id.metal), BONE(id.bone), PAINT(id.paint, '#E4572E', '#B3202A'), GLASS(id.glass)) +
      rod(-128) + rod(128) + skullRider(id) +
      ribbon(236, 168, 'ENGINE CLUB', RYE(), 19) +
      txt(BEBAS(), 'TWH  ·  BUILT NOT BOUGHT  ·  CHILE', 13, 150, 292, { fill: INK, spacing: 2.4 });
  };

  // 33. Insignia "Custom": pistón entre alas, texto curvo y manuscrita
  L['winged-piston'] = () => {
    const id = { metal: 'wpM', wing: 'wpW' };
    const wing = () => {
      let f = '';
      // remeras largas, de abajo hacia arriba (cada una tapa a la anterior)
      for (let k = 6; k >= 0; k--) {
        const bx = 124 - k * 10, by = 136 - k * 2, len = 40 + k * 7, ang = (205 + k * 6.5) * Math.PI / 180;
        const tx = r2(bx + len * Math.cos(ang)), ty = r2(by - len * Math.sin(ang) + 24);
        f += `<path d="M${bx} ${by} Q${r2((bx + tx) / 2 - 4)} ${r2((by + ty) / 2 - 12)} ${tx} ${ty} Q${r2((bx + tx) / 2 + 10)} ${r2((by + ty) / 2 + 2)} ${bx + 10} ${by + 4} Z" fill="url(#${id.wing})" ${OUT(2.4)}/>`;
        f += `<path d="M${bx + 3} ${by + 2} Q${r2((bx + tx) / 2)} ${r2((by + ty) / 2 - 4)} ${r2(tx + 3)} ${r2(ty - 2)}" stroke="#6E6C66" stroke-width="1" fill="none"/>`;
      }
      // cobertoras en escamas
      for (let row = 0; row < 2; row++) for (let k = 0; k < 6 - row; k++) {
        const x = 126 - k * 11 - row * 6, y = 118 - k * 2.6 + row * 10;
        f += `<path d="M${x} ${y} Q${x - 12} ${y + 1} ${x - 15} ${y + 15} Q${x - 2} ${y + 16} ${x + 4} ${y + 7} Z" fill="url(#${id.wing})" ${OUT(2)}/>`;
      }
      return f + `<path d="M132 112 Q96 92 52 98 Q74 108 96 116 Q114 122 132 124 Z" fill="url(#${id.wing})" ${OUT(2.4)}/>`;
    };
    return defs(METAL(id.metal), lin(id.wing, [[0, '#FFFFFF'], [.5, LIGHT], [1, '#9C9890']], 0, 1)) +
      rings(140, 128) +
      arc(RYE(), 'TWH CUSTOM 4X4', 24, 150, 150, 106, { fill: INK, spacing: 2 }) +
      arc(BEBAS(), 'BUILD  &  REPAIR  ·  CHILE', 17, 150, 150, 118, { fill: INK, spacing: 2.5, bottom: true }) +
      star(36, 150, 7, MUST) + star(264, 150, 7, MUST) +
      `<g transform="translate(0 6)">${wing()}<g transform="translate(300 0) scale(-1 1)">${wing()}</g></g>` +
      `<g transform="translate(150 142) scale(.82)">${piston(id.metal)}</g>` +
      txt(SCRIPT(), 'Garage', 58, 150, 214, { fill: RED, stroke: BG, sw: 7, skew: -6 });
  };

  // 34. Cóndor + bujías cruzadas (insignia)
  L['condor-plugs'] = () => {
    const id = { metal: 'cpM', cer: 'cpC', head: 'cpH', ruff: 'cpR' };
    const plug = (rot) => `<g transform="translate(150 140) rotate(${rot}) scale(.86)">${bujia(id.metal, id.cer)}</g>`;
    // cabeza de cóndor (perfil a la izquierda) con volumen
    const head =
      `<path d="M176 196 Q182 168 176 146 Q170 122 154 110 Q138 98 120 100 Q104 102 98 114 Q84 114 77 125 Q73 135 79 141 Q83 134 92 133 Q99 139 109 138 Q119 148 130 152 Q142 164 142 196 Z" fill="url(#${id.head})" ${OUT(3)}/>` +
      `<path d="M95 116 Q94 100 104 92 Q108 80 120 82 Q126 72 138 78 Q150 78 152 92 Q144 90 138 96 Q124 96 114 104 Q104 108 95 116 Z" fill="${RED}" ${OUT(2.4)}/>` +
      `<path d="M106 100 Q114 95 123 96 M119 92 Q128 90 137 94" stroke="#3A1410" stroke-width="1.4" fill="none"/>` +
      `<path d="M78 124 Q72 134 79 141 Q80 133 87 131 Q83 126 78 124 Z" fill="${MUST}" ${OUT(1.6)}/>` +
      `<path d="M91 126 Q100 127 108 123" stroke="${DARK}" stroke-width="2" fill="none"/>` +
      `<circle cx="117" cy="114" r="5.4" fill="${DARK}"/><circle cx="116" cy="114" r="2.6" fill="${MUST}"/><circle cx="115" cy="113" r=".9" fill="#FFFFFF"/>` +
      [0, 1, 2, 3, 4, 5, 6].map((k) => `<path d="M${136 + k * 4} ${120 + k * 9} Q${148 + k * 3} ${128 + k * 9} ${162 + k * 2} ${122 + k * 9}" stroke="#C98B78" stroke-width="1.2" fill="none" opacity=".7"/>`).join('');
    // collar de plumón
    let fluff = '';
    const ring = (R, n, rr) => {
      for (let k = 0; k <= n; k++) {
        const a = (16 + (148 * k) / n) * Math.PI / 180;
        fluff += `<circle cx="${r2(148 + R * Math.cos(a))}" cy="${r2(170 + R * Math.sin(a))}" r="${rr + (k % 3 === 1 ? 2.5 : 0)}" fill="url(#${id.ruff})"/>`;
      }
    };
    ring(40, 14, 10.5); ring(31, 10, 10);
    return defs(METAL(id.metal), lin(id.cer, [[0, '#FFFFFF'], [.4, LIGHT], [1, '#B8B3A6']]), lin(id.head, [[0, '#C98B78'], [.45, '#8E5446'], [1, '#4A2A24']], 1, 1), rad(id.ruff, [[0, '#FFFFFF'], [.7, LIGHT], [1, '#C9C4B8']])) +
      rings(140, 128) +
      arc(RYE(), 'CONDOR 4X4', 26, 150, 150, 106, { fill: INK, spacing: 3 }) +
      arc(BEBAS(), 'SPARK  &  DIRT  ·  ANDES', 17, 150, 150, 118, { fill: INK, spacing: 2.5, bottom: true }) +
      star(36, 150, 7, MUST) + star(264, 150, 7, MUST) +
      plug(-34) + plug(34) +
      // hombros: plumaje negro del cuerpo (tapa la base de las bujías)
      `<path d="M102 206 Q108 188 148 188 Q190 188 196 206 Q200 226 188 234 Q150 242 110 234 Q98 226 102 206 Z" fill="${DARK}" stroke="${INK}" stroke-width="2.4"/>` +
      [0, 1, 2, 3, 4, 5].map((k) => { const x = 112 + k * 13; return `<path d="M${x} ${212 + Math.abs(k - 2.5) * 2} Q${x + 5} ${226} ${x + 9} ${232 - Math.abs(k - 2.5)}" stroke="#77756E" stroke-width="1.6" fill="none"/>`; }).join('') +
      head + `<g stroke="${DARK}" stroke-width="3">${fluff.replace(/fill=/g, 'paint-order="stroke" fill=')}</g>` + `<g>${fluff}</g>` +
      '';
  };

  // ================= DEPORTE (moderno) =================

  // atardecer retro en bandas (recortado por clipId)
  const sunsetBands = (clipId, y0, y1) => {
    const cols = ['#FFE08A', MUST, ORANGE, RED, DRED];
    const h = (y1 - y0) / cols.length;
    return cols.map((c, k) => `<rect x="0" y="${r2(y0 + k * h)}" width="300" height="${r2(h - (k ? 2 + k : 0))}" fill="${c}"/>`).join('');
  };

  // 27. Kite Club: cometa con celdas en degradado, líneas al rider, olas y manuscrita
  L['kite-club'] = () => {
    const cx = 150, cy = 172, R = 112, r = 84, a0 = 16, a1 = 164;
    const P = (rad, deg) => [r2(cx + rad * Math.cos(deg * Math.PI / 180)), r2(cy - rad * Math.sin(deg * Math.PI / 180))];
    const cells = [];
    const n = 9;
    for (let k = 0; k < n; k++) {
      const s0 = a0 + ((a1 - a0) * k) / n, s1 = a0 + ((a1 - a0) * (k + 1)) / n;
      const taper = (d) => 1 - Math.pow(Math.abs(d - 90) / 82, 3) * .55;   // puntas más delgadas
      const ro0 = r + (R - r) * taper(s0), ro1 = r + (R - r) * taper(s1);
      const [x1, y1] = P(r, s0), [x2, y2] = P(ro0, s0), [x3, y3] = P(ro1, s1), [x4, y4] = P(r, s1);
      cells.push(`<path d="M${x1} ${y1} L${x2} ${y2} A${R} ${R} 0 0 0 ${x3} ${y3} L${x4} ${y4} A${r} ${r} 0 0 1 ${x1} ${y1} Z" fill="url(#kc${k % 2})" stroke="${BG}" stroke-width="2.4" stroke-linejoin="round"/>`);
    }
    const lead = (() => {   // borde de ataque inflado
      let d = '';
      for (let k = 0; k <= 40; k++) { const s = a0 + ((a1 - a0) * k) / 40, rr = r + (R - r) * (1 - Math.pow(Math.abs(s - 90) / 82, 3) * .55) + 2; const [x, y] = P(rr, s); d += (k ? 'L' : 'M') + x + ' ' + y; }
      return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/>`;
    })();
    const bar = [150, 206];
    const lines = [P(r, 26), P(r, 70), P(r, 110), P(r, 154)].map(([x, y]) => `<path d="M${x} ${y} L${bar[0] + (x < 150 ? -10 : 10)} ${bar[1]}" stroke="${INK}" stroke-width=".8" opacity=".7"/>`).join('');
    const waves = [0, 1, 2].map((k) => `<path d="M${40 + k * 18} ${222 + k * 7} q15 -6 30 0 t30 0 t30 0 t30 0 t30 0 t30 0" stroke="${k ? INK : MUST}" stroke-width="${2.2 - k * .5}" fill="none" opacity="${1 - k * .25}" stroke-linecap="round"/>`).join('');
    return defs(lin('kc0', [[0, '#FFE08A'], [.5, MUST], [1, ORANGE]], 0, 1), lin('kc1', [[0, ORANGE], [.6, RED], [1, DRED]], 0, 1)) +
      txt(BEBAS(), 'TWH  ·  EST. 2001', 15, 150, 42, { fill: INK, spacing: 6 }) +
      cells.join('') + lead + lines +
      `<path d="M139 ${bar[1]} H161" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>` + waves +
      txt(SCRIPT(), 'Kite Club', 64, 150, 270, { fill: INK, stroke: BG, sw: 8, skew: -4 }) +
      txt(BEBAS(), 'RIDE THE WIND  ·  CHILE', 14, 150, 292, { fill: MUST, spacing: 5 });
  };

  // bici MTB de perfil (relleno con volumen) centrada en 0,0
  function bike(m) {
    const wheel = (x) => {
      let knobs = '';
      for (let k = 0; k < 30; k++) { const a = (k * Math.PI * 2) / 30; knobs += `<path d="M${r2(x + 31 * Math.cos(a))} ${r2(31 * Math.sin(a))} L${r2(x + 36 * Math.cos(a))} ${r2(36 * Math.sin(a))}" stroke="${LIGHT}" stroke-width="3" stroke-linecap="round"/>`; }
      return `<circle cx="${x}" cy="0" r="31" fill="none" stroke="${LIGHT}" stroke-width="6"/><circle cx="${x}" cy="0" r="22" fill="none" stroke="#77756E" stroke-width="1.4"/>${knobs}<circle cx="${x}" cy="0" r="5" fill="url(#${m})"/>`;
    };
    return wheel(-56) + wheel(56) +
      `<path d="M-56 0 L-8 2 L-20 -46 Z" fill="none" stroke="url(#${m})" stroke-width="6" stroke-linejoin="round"/>` +       // triángulo trasero
      `<path d="M-8 2 L34 -50" stroke="url(#${m})" stroke-width="9" stroke-linecap="round"/>` +                                 // diagonal
      `<path d="M-20 -46 L34 -52" stroke="url(#${m})" stroke-width="6" stroke-linecap="round"/>` +                              // superior
      `<path d="M-16 -34 L-4 -22" stroke="${MUST}" stroke-width="7" stroke-linecap="round"/>` +                                 // amortiguador
      `<path d="M34 -58 L40 -40 L56 0" stroke="url(#${m})" stroke-width="7" stroke-linecap="round" fill="none"/>` +              // horquilla
      `<path d="M30 -64 L36 -60 M24 -66 H48" stroke="${LIGHT}" stroke-width="4" stroke-linecap="round"/>` +                     // manubrio
      `<path d="M-24 -50 L-20 -46 M-34 -54 Q-22 -60 -10 -54" stroke="${LIGHT}" stroke-width="4.5" stroke-linecap="round" fill="none"/>` + // sillín
      `<circle cx="-8" cy="2" r="8" fill="url(#${m})" stroke="${DARK}" stroke-width="2"/><path d="M-8 2 L4 14 M-2 14 H10" stroke="${LIGHT}" stroke-width="3.4" stroke-linecap="round"/>`;
  }

  // 28. Trail Club: insignia de montaña con cerros en capas, pinos, sendero y bici
  L['mtb-trail'] = () => {
    const frame = 'M150 30 L262 120 V246 Q262 270 238 270 H62 Q38 270 38 246 V120 Z';
    let pines = '';
    [[72, 196, 1], [88, 204, .8], [214, 198, .95], [232, 206, .75]].forEach(([x, y, s]) => {
      pines += `<path transform="translate(${x} ${y}) scale(${s})" d="M0 -40 L12 -14 H6 L16 4 H4 V12 H-4 V4 H-16 L-6 -14 H-12 Z" fill="${DARK}"/>`;
    });
    return defs(`<clipPath id="mtc"><path d="${frame}"/></clipPath>`, METAL('mtM')) +
      `<g clip-path="url(#mtc)">` + sunsetBands('mtc', 30, 170) +
      `<circle cx="196" cy="118" r="26" fill="#FFE08A"/>` +
      `<path d="M38 172 L94 104 L124 136 L160 88 L206 150 L236 124 L262 160 V270 H38 Z" fill="#3A1410"/>` +
      `<path d="M150 88 L160 88 L176 110 L166 104 L158 114 Z M88 112 L94 104 L104 116 L97 113 Z" fill="${LIGHT}"/>` +
      `<path d="M38 200 Q100 160 150 196 T262 186 V270 H38 Z" fill="${DARK}"/>` +
      `<path d="M120 270 Q140 238 128 222 Q118 210 150 200" stroke="${MUST}" stroke-width="3" stroke-dasharray="6 6" fill="none"/>` +
      pines + `</g>` +
      `<path d="${frame}" fill="none" stroke="${INK}" stroke-width="5"/><path d="M150 42 L252 124 V244 Q252 260 236 260 H64 Q48 260 48 244 V124 Z" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
      `<g transform="translate(150 226) scale(.62)">${bike('mtM')}</g>` +
      txt(SLAB(), 'TRAIL CLUB', 30, 150, 100, { fill: INK, stroke: BG, sw: 6, spacing: 1 }) +
      txt(SCRIPT(), 'Ride the Andes', 32, 150, 292, { fill: INK, stroke: BG, sw: 6, skew: -4 });
  };

  // moto MX en salto (silueta con volumen) centrada en 0,0
  function moto(m, paint) {
    const wheel = (x, y) => {
      let knobs = '';
      for (let k = 0; k < 26; k++) {
        const a = (k * Math.PI * 2) / 26, p = (rr, da) => `${r2(x + rr * Math.cos(a + da))} ${r2(y + rr * Math.sin(a + da))}`;
        knobs += `<path d="M${p(29, -.06)} L${p(35, -.05)} L${p(35, .05)} L${p(29, .06)} Z" fill="${INK}"/>`;
      }
      return `<circle cx="${x}" cy="${y}" r="30" fill="none" stroke="${INK}" stroke-width="7"/><circle cx="${x}" cy="${y}" r="21" fill="none" stroke="url(#${m})" stroke-width="2"/>${knobs}<circle cx="${x}" cy="${y}" r="6" fill="url(#${m})"/>`;
    };
    return wheel(-66, 10) + wheel(68, 10) +
      `<path d="M-66 10 L-6 -14" stroke="url(#${m})" stroke-width="7" stroke-linecap="round"/>` +                                  // basculante
      `<path d="M2 -40 L30 -42 L34 -14 L4 -12 Z" fill="url(#${m})" stroke="${DARK}" stroke-width="2"/>` +                            // cilindro
      [0, 1, 2, 3].map((k) => `<path d="M${4 + k} ${-34 + k * 6} H${32 + k}" stroke="${DARK}" stroke-width="1.6"/>`).join('') +
      `<path d="M-14 -14 Q-14 10 10 12 Q34 10 34 -14 Z" fill="#55574F" stroke="${DARK}" stroke-width="2"/>` +                      // cárter
      `<path d="M38 -54 L68 10" stroke="url(#${m})" stroke-width="8" stroke-linecap="round"/>` +                                   // horquilla
      `<path d="M-96 -48 L-84 -52 L2 -50 Q16 -64 36 -64 L52 -54 L44 -36 L22 -30 L8 -38 L-6 -38 L-24 -14 L-46 -12 L-54 -32 L-82 -38 Z" fill="url(#${paint})" stroke="${BG}" stroke-width="2.6" stroke-linejoin="round"/>` + // carrocería
      `<path d="M-84 -52 L2 -50 L-2 -44 L-80 -46 Z" fill="${DARK}"/>` +                                                                // asiento
      `<path d="M-50 -36 L-24 -38 L-28 -20 L-46 -18 Z" fill="${LIGHT}"/>` + txt(SLAB(), '74', 13, -37, -22, { fill: DARK }) +       // placa lateral
      `<path d="M40 -6 Q64 -20 96 -6 L90 0 Q66 -10 44 2 Z" fill="url(#${paint})" stroke="${BG}" stroke-width="2"/>` +             // guardabarros
      `<path d="M30 -66 L36 -80 M22 -82 Q36 -88 52 -82" stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"/>` + // manubrio
      `<path d="M44 -62 L70 -56 L60 -42 L46 -48 Z" fill="${LIGHT}"/>` +                                                               // placa frontal
      `<path d="M24 -20 Q10 4 -14 2 Q-34 0 -40 -26 L-88 -44" stroke="url(#${m})" stroke-width="6" fill="none" stroke-linecap="round"/>`; // escape
  }

  // 29. TWH MX: tipografía de carrera con franjas de velocidad y moto en salto
  L['mx-moto'] = () => {
    const speed = [ORANGE, RED, DRED].map((c, k) => `<path d="M${30 + k * 10} ${206 + k * 14} H${250 - k * 20} L${262 - k * 20} ${196 + k * 14} H${42 + k * 10} Z" fill="${c}"/>`).join('');
    let checker = '';
    for (let k = 0; k < 20; k++) for (let j = 0; j < 2; j++) if ((k + j) % 2 === 0) checker += `<rect x="${50 + k * 10}" y="${54 + j * 6}" width="10" height="6" fill="${INK}"/>`;
    return defs(METAL('mxM'), PAINT('mxP', '#F2A541', '#E4572E')) +
      checker + txt(BEBAS(), 'TWH  MOTOCROSS  TEAM', 18, 150, 50, { fill: INK, spacing: 5 }) +
      speed + `<g transform="translate(150 162) rotate(-12) scale(.9)">${moto('mxM', 'mxP')}</g>` +
      txt(SLAB(), 'MX', 70, 150, 278, { fill: INK, stroke: BG, sw: 8, skew: -12, spacing: 2 }) +
      txt(BEBAS(), 'DIRT · SAND · MUD', 13, 150, 296, { fill: MUST, spacing: 5 });
  };

  // 30. Andes Outdoor: círculo con atardecer en bandas, cordillera en capas y manuscrita
  L['andes-outdoor'] = () => {
    return defs(`<clipPath id="aoc"><circle cx="150" cy="140" r="106"/></clipPath>`) +
      `<g clip-path="url(#aoc)">` + `<rect x="0" y="0" width="300" height="300" fill="${BG}"/>` + sunsetBands('aoc', 40, 160) +
      `<circle cx="150" cy="132" r="40" fill="#FFE08A"/>` +
      [0, 1, 2, 3].map((k) => `<rect x="100" y="${136 + k * 8}" width="100" height="${2 + k}" fill="${k < 2 ? MUST : ORANGE}"/>`).join('') +
      `<path d="M40 176 L88 120 L112 146 L150 96 L186 140 L210 120 L262 176 Z" fill="#3A1410"/>` +
      `<path d="M138 112 L150 96 L164 114 L156 110 L150 118 Z M80 130 L88 120 L98 132 L90 129 Z M204 128 L210 120 L220 132 Z" fill="${LIGHT}"/>` +
      `<path d="M40 186 L100 150 L130 172 L170 140 L212 170 L262 160 V250 H40 Z" fill="${BG}"/>` +
      [0, 1, 2, 3].map((k) => `<path d="M${64 + k * 18} ${200 + k * 9} H${236 - k * 18}" stroke="${MUST}" stroke-width="${2.2 - k * .4}" stroke-dasharray="${18 - k * 3} 7"/>`).join('') +
      `</g>` +
      `<circle cx="150" cy="140" r="106" fill="none" stroke="${INK}" stroke-width="4"/><circle cx="150" cy="140" r="114" fill="none" stroke="${INK}" stroke-width="1.4"/>` +
      arc(BEBAS(), 'TWH  OFF ROAD  OUTDOOR  CO.', 17, 150, 140, 120, { fill: INK, spacing: 4 }) +
      txt(SCRIPT(), 'Andes', 70, 150, 250, { fill: INK, stroke: BG, sw: 9, skew: -6 }) +
      txt(BEBAS(), 'EST. 2001  ·  4X4  ·  TRAIL  ·  CAMP', 13, 150, 290, { fill: MUST, spacing: 3 });
  };

  // 31. Enduro: placa de carrera con volumen, número pesado y salpicaduras de barro
  L['enduro-plate'] = () => {
    const screw = (x, y) => `<circle cx="${x}" cy="${y}" r="6" fill="url(#epM)" stroke="${DARK}" stroke-width="1.6"/><path d="M${x - 3.5} ${y - 1} L${x + 3.5} ${y + 1}" stroke="#3E403C" stroke-width="1.6"/>`;
    // salpicaduras de barro (semilla fija: siempre igual)
    let seed = 7;
    const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
    let mud = '';
    for (let k = 0; k < 26; k++) {
      const x = 60 + rnd() * 180, y = 150 + rnd() * 70, rr = 1.5 + rnd() * 5;
      mud += `<circle cx="${r2(x)}" cy="${r2(y)}" r="${r2(rr)}" fill="#6B5A45" opacity="${r2(.5 + rnd() * .4)}"/>`;
    }
    mud += `<path d="M64 214 Q90 196 120 214 Q150 228 176 208 Q206 196 236 214 L238 222 Q150 238 62 222 Z" fill="#6B5A45" opacity=".75"/>`;
    return defs(lin('epP', [[0, '#FFFFFF'], [.45, LIGHT], [1, '#B9B4A6']], 1, 1), METAL('epM'), `<clipPath id="epc"><path d="M58 66 Q150 40 242 66 L250 214 Q150 238 50 214 Z"/></clipPath>`) +
      `<path d="M58 66 Q150 40 242 66 L250 214 Q150 238 50 214 Z" fill="url(#epP)" stroke="${DARK}" stroke-width="3"/>` +
      `<g clip-path="url(#epc)">${mud}</g>` +
      `<path d="M66 78 Q150 56 234 78 L240 204 Q150 226 60 204 Z" fill="none" stroke="${DARK}" stroke-width="2.4"/>` +
      screw(74, 104) + screw(226, 104) + screw(78, 196) + screw(222, 196) +
      txt(BEBAS(), 'TWH  ENDURO', 20, 150, 104, { fill: DARK, spacing: 3 }) +
      txt(SLAB(), '01', 104, 150, 196, { fill: DARK, spacing: 2 }) +
      [ORANGE, RED, DRED].map((c, k) => `<path d="M${40 + k * 6} ${244 + k * 9} H${260 - k * 6} L${256 - k * 6} ${250 + k * 9} H${44 + k * 6} Z" fill="${c}"/>`).join('') +
      txt(BEBAS(), 'TEAM  ·  4X4  ·  CHILE', 15, 150, 290, { fill: INK, spacing: 6 });
  };

  return L;
};
