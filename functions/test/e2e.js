// Prueba de punta a punta contra los emuladores (firebase emulators:start).
// Uso: node functions/test/e2e.js   → deja datos de ejemplo y un usuario admin de prueba (clave: emulador-twh)
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = '127.0.0.1:9099';
const assert = require('node:assert');
const admin = require('firebase-admin');
const base = require('../shared/catalog.js');
const P = 'the-white-hilux';
admin.initializeApp({ projectId: P });
const db = admin.firestore();
const API = `http://127.0.0.1:5001/${P}/southamerica-east1`;

const polera = base.products.find((p) => p.type === 'polera' && p.colors.includes('negro'));
const poleron = base.products.find((p) => p.type === 'poleron');
const jockey = base.products.find((p) => p.type === 'jockey');
const customer = { name: 'Camila Rojas', email: 'camila@ejemplo.cl', phone: '+56 9 8765 4321' };
const rm = { method: 'despacho', region: 'Región Metropolitana', comuna: 'Providencia', address: 'Av. Italia 1450, depto 32' };

async function post(items, shipping = rm, cust = customer) {
  const r = await fetch(`${API}/crearPreferencia`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5500' }, body: JSON.stringify({ items, customer: cust, shipping }) });
  return { status: r.status, body: await r.json() };
}

(async () => {
  for (const d of (await db.collection('pedidos').get()).docs) await d.ref.delete();
  await db.doc('tienda/catalogo').set({
    products: {
      [polera.id]: { stock: { negro: { S: 0, M: 2, L: 4, XL: 1, XXL: 0 }, blanco: { S: 1, M: 0, L: 3, XL: 0, XXL: 0 } } },
      [poleron.id]: { status: 'proximamente' },
      [jockey.id]: { price: 17990, stock: { negro: { 'Única': 0 } } },
    },
    settings: { deliveryDaysRM: 3, deliveryDaysRegiones: 7, alertDays: 2 },
  });

  // 1) Pedido válido → queda pendiente de pago
  const a = await post([{ id: polera.id, size: 'M', color: 'negro', qty: 2 }]);
  assert.strictEqual(a.status, 200, JSON.stringify(a.body));
  let o = (await db.doc('pedidos/' + a.body.order_id).get()).data();
  assert.strictEqual(o.status, 'pendiente_pago');
  console.log('✔ pedido creado', a.body.order_id, a.body.total);

  // 2) Próximamente, agotado y sin stock suficiente → rechazados
  assert.strictEqual((await post([{ id: poleron.id, size: 'M', color: 'negro', qty: 1 }])).status, 400);
  const j = await post([{ id: jockey.id, size: 'Única', color: 'negro', qty: 1 }]);
  assert.strictEqual(j.status, 400); console.log('✔ agotado:', j.body.error);
  const m = await post([{ id: polera.id, size: 'M', color: 'negro', qty: 3 }]);
  assert.strictEqual(m.status, 400); console.log('✔ sin stock suficiente:', m.body.error);

  // 3) Pago aprobado → pagado, promesa, stock descontado
  const s = await (await fetch(`${API}/simularPago?id=${a.body.order_id}`)).json();
  assert.ok(s.ok, JSON.stringify(s));
  o = (await db.doc('pedidos/' + a.body.order_id).get()).data();
  let cat = (await db.doc('tienda/catalogo').get()).data();
  assert.strictEqual(o.status, 'pagado');
  assert.strictEqual(cat.products[polera.id].stock.negro.M, 0);
  console.log('✔ pagado, promesa', o.promisedDate, '· stock negro M → 0');

  // 4) Aviso repetido → no descuenta de nuevo
  const again = await (await fetch(`${API}/simularPago?id=${a.body.order_id}`)).json();
  assert.ok(again.already);
  cat = (await db.doc('tienda/catalogo').get()).data();
  assert.strictEqual(cat.products[polera.id].stock.negro.L, 4);
  console.log('✔ aviso repetido ignorado');

  // 5) Ahora M negro está agotado
  assert.strictEqual((await post([{ id: polera.id, size: 'M', color: 'negro', qty: 1 }])).status, 400);
  console.log('✔ talla agotada después de la venta');

  // 6) Código de descuento: vista previa, pedido con descuento y conteo de usos al pagar
  await db.doc('cupones/TWH10').set({ code: 'TWH10', name: 'Prueba', kind: 'percent', value: 10, scope: 'all', targets: [], active: true, uses: 0, createdAt: new Date().toISOString() });
  const pv = await (await fetch(`${API}/validarCupon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coupon: 'twh10', items: [{ id: polera.id, size: 'L', color: 'negro', qty: 1 }] }) })).json();
  assert.strictEqual(pv.amount, Math.round(polera.price * 0.1), JSON.stringify(pv));
  const bad = await fetch(`${API}/validarCupon`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coupon: 'NOEXISTE', items: [{ id: polera.id, size: 'L', color: 'negro', qty: 1 }] }) });
  assert.strictEqual(bad.status, 400);
  const dc = await (await fetch(`${API}/crearPreferencia`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ id: polera.id, size: 'L', color: 'negro', qty: 1 }], coupon: 'TWH10', customer, shipping: rm }) })).json();
  await fetch(`${API}/simularPago?id=${dc.order_id}`);
  const dco = (await db.doc('pedidos/' + dc.order_id).get()).data();
  assert.strictEqual(dco.discount.amount, pv.amount);
  assert.strictEqual((await db.doc('cupones/TWH10').get()).data().uses, 1);
  console.log('✔ código TWH10: -' + pv.amount + ', uso contado');

  // 7) Oferta automática: el servidor cobra el precio rebajado
  await db.doc('tienda/catalogo').update({ 'offers.ofjk': { name: 'Semana del jockey', kind: 'percent', value: 25, scope: 'category', targets: ['jockey'], active: true, from: '', to: '', createdAt: new Date().toISOString() } });
  const jk2 = base.products.filter((p) => p.type === 'jockey')[1];
  const of = await post([{ id: jk2.id, size: 'Única', color: 'negro', qty: 1 }]);
  const ofo = (await db.doc('pedidos/' + of.body.order_id).get()).data();
  assert.strictEqual(ofo.lines[0].list_price, jk2.price);
  assert.ok(ofo.lines[0].unit_price < jk2.price);
  await fetch(`${API}/simularPago?id=${of.body.order_id}`);
  console.log('✔ oferta: jockey a', ofo.lines[0].unit_price, 'en vez de', jk2.price, '· SKU', ofo.lines[0].sku);

  // Datos de ejemplo para el panel: un pedido regional pagado, uno atrasado, uno pendiente
  const b = await post([{ id: polera.id, size: 'L', color: 'negro', qty: 1 }, { id: 'sticker-twh', size: 'Única', design: 'race-dept', qty: 3 }],
    { method: 'despacho', region: 'Biobío', comuna: 'Concepción', address: 'O\'Higgins 820', notes: 'Dejar en conserjería' },
    { name: 'Diego Muñoz', email: 'diego@ejemplo.cl', phone: '987654321' });
  await fetch(`${API}/simularPago?id=${b.body.order_id}`);
  const c = await post([{ id: polera.id, size: 'L', color: 'blanco', qty: 1 }], { method: 'retiro' }, { name: 'Pedro Soto', email: 'pedro@ejemplo.cl', phone: '+56912341234' });
  await fetch(`${API}/simularPago?id=${c.body.order_id}`);
  await db.doc('pedidos/' + c.body.order_id).update({ promisedDate: '2026-11-16', paidDate: '2026-11-11' });
  await post([{ id: polera.id, size: 'XL', color: 'negro', qty: 1 }], rm, { name: 'Ana Pérez', email: 'ana@ejemplo.cl', phone: '+56911112222' });

  // Usuario admin de prueba (solo emulador)
  try { await admin.auth().createUser({ email: 'tmontes30@gmail.com', password: 'emulador-twh', emailVerified: true }); } catch (e) { if (e.code !== 'auth/email-already-exists') throw e; }
  console.log('\nTODO OK');
  process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e.message); process.exit(1); });
