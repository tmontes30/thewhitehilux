// Copia a functions/shared/ el código que comparten la tienda y el servidor.
// Corre solo antes de cada deploy (firebase.json → predeploy) y antes de los emuladores.
const fs = require('fs');
const path = require('path');

const WEB = path.join(__dirname, '..', 'web');
const OUT = path.join(__dirname, 'shared');
const FILES = { 'catalog.js': 'data/catalog.js', 'core.js': 'assets/js/core.js', 'order.js': 'lib/order.js', 'email.js': 'lib/email.js' };

fs.mkdirSync(OUT, { recursive: true });
for (const [name, from] of Object.entries(FILES)) {
  fs.copyFileSync(path.join(WEB, from), path.join(OUT, name));
}
console.log('shared/ actualizado:', Object.keys(FILES).join(', '));
