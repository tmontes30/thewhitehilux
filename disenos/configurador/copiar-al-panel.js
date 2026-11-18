// Copia el configurador (tal cual) al panel de admin: web/admin/configurador/
// El original sigue siendo disenos/configurador/; esta copia solo ajusta las rutas a los logos.
// Lo corre APLICAR-COLECCION.bat antes de publicar. A mano: node disenos/configurador/copiar-al-panel.js
const fs = require('fs');
const path = require('path');

const HERE = __dirname;
const OUT = path.join(HERE, '..', '..', 'web', 'admin', 'configurador');
fs.mkdirSync(path.join(OUT, 'bases'), { recursive: true });

// Página: desde web/admin/configurador/ los logos están en ../../assets/logos/
let html = fs.readFileSync(path.join(HERE, 'configurador.html'), 'utf8');
html = html.split('../../web/assets/').join('../../assets/');
html = html.replace('<meta charset="utf-8">', '<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">\n<!-- COPIA GENERADA por disenos/configurador/copiar-al-panel.js: no editar aquí -->');
fs.writeFileSync(path.join(OUT, 'configurador.html'), html);

for (const f of ['posiciones.js', 'datos.js']) fs.copyFileSync(path.join(HERE, f), path.join(OUT, f));

// Fotos base (solo las que cambian)
const bases = fs.readdirSync(path.join(HERE, 'bases')).filter((f) => /\.(png|jpe?g|webp)$/i.test(f));
let n = 0;
for (const f of bases) {
  const src = path.join(HERE, 'bases', f);
  const dst = path.join(OUT, 'bases', f);
  if (!fs.existsSync(dst) || fs.statSync(dst).size !== fs.statSync(src).size) { fs.copyFileSync(src, dst); n++; }
}
for (const f of fs.readdirSync(path.join(OUT, 'bases'))) if (!bases.includes(f)) fs.unlinkSync(path.join(OUT, 'bases', f));

console.log(`Configurador copiado al panel (${bases.length} fotos base, ${n} actualizadas).`);
