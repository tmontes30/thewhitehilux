const test = require('node:test');
const assert = require('node:assert');
const { products, config } = require('../data/catalog.js');
const { buildOrder, toMercadoPagoItems, OrderError } = require('../lib/order');

const customer = { name: 'Juan Pérez', email: 'juan@ejemplo.cl', phone: '+56 9 1234 5678' };
// productos de ejemplo tomados del catálogo (los ids cambian al aplicar una colección nueva)
const first = (fn) => { const p = products.find(fn); if (!p) throw new Error('falta producto de prueba'); return p.id; };
const POLERA = first((p) => p.type === 'polera' && p.colors.includes('negro'));
const POLERA_BLANCA = first((p) => p.type === 'polera' && p.colors.includes('blanco'));
const POLERON = first((p) => p.type === 'poleron');
const JOCKEY = first((p) => p.type === 'jockey');

const rm = { method: 'despacho', region: 'Región Metropolitana', comuna: 'Ñuñoa', address: 'Irarrázaval 1234' };

test('usa el precio del catálogo e ignora el precio que manda el navegador', () => {
  const o = buildOrder(
    { items: [{ id: POLERA, size: 'M', color: 'negro', qty: 1, price: 1 }], customer, shipping: rm },
    products,
    config
  );
  const price = products.find((p) => p.id === POLERA).price;
  assert.strictEqual(o.lines[0].unit_price, price);
  assert.strictEqual(o.total, price + o.shipping.cost);
});

test('envío gratis solo en RM sobre el mínimo', () => {
  const reg = { ...rm, region: 'Biobío', comuna: 'Concepción' };
  const a = buildOrder({ items: [{ id: 'sticker-twh', size: 'Única', design: 'race-dept', qty: 1 }], customer, shipping: reg }, products, config);
  assert.strictEqual(a.shipping.zone, 'regiones');
  assert.strictEqual(a.shipping.cost, 5990);
  const b = buildOrder({ items: [{ id: POLERON, size: 'L', color: 'negro', qty: 2 }], customer, shipping: rm }, products, config);
  assert.ok(b.subtotal >= config.freeShippingFrom);
  assert.strictEqual(b.shipping.cost, 0);
  assert.strictEqual(b.total, b.subtotal);
  const c = buildOrder({ items: [{ id: POLERON, size: 'L', color: 'negro', qty: 2 }], customer, shipping: reg }, products, config);
  assert.strictEqual(c.shipping.cost, 5990);
  assert.throws(() => buildOrder({ items: [{ id: 'sticker-twh', size: 'Única', qty: 1 }], customer, shipping: rm }, products, config), /diseño/);
});

test('retiro no pide dirección y no cobra envío', () => {
  const o = buildOrder({ items: [{ id: JOCKEY, size: 'Única', color: 'negro', qty: 1 }], customer, shipping: { method: 'retiro', pickupPoint: 'Lo Barnechea' } }, products, config);
  assert.strictEqual(o.shipping.cost, 0);
  assert.strictEqual(o.shipping.pickupPoint, 'Lo Barnechea');
  assert.throws(() => buildOrder({ items: [{ id: JOCKEY, size: 'Única', color: 'negro', qty: 1 }], customer, shipping: { method: 'retiro' } }, products, config), /retirar/);
  assert.strictEqual(toMercadoPagoItems(o).length, 1);
});

test('agrega el envío como línea en Mercado Pago', () => {
  const o = buildOrder({ items: [{ id: POLERA_BLANCA, size: 'L', color: 'blanco', qty: 1 }], customer, shipping: rm }, products, config);
  const items = toMercadoPagoItems(o);
  assert.strictEqual(items.length, 2);
  assert.deepStrictEqual(items[1], { code: 'envio', title: 'Despacho Región Metropolitana', quantity: 1, unit_price: 3990 });
  assert.match(items[0].title, /Talla L · Blanco/);
});

test('rechaza talla, color, cantidad o producto inválidos', () => {
  const bad = [
    { id: 'no-existe', size: 'M', qty: 1 },
    { id: POLERA, size: 'XS', color: 'negro', qty: 1 },
    { id: POLERA, size: 'M', color: 'rosado', qty: 1 },
    { id: POLERA, size: 'M', color: 'negro', qty: 0 },
    { id: POLERA, size: 'M', color: 'negro', qty: 1.5 },
    { id: POLERA, size: 'M', color: 'negro', qty: 11 },
  ];
  for (const it of bad) {
    assert.throws(() => buildOrder({ items: [it], customer, shipping: rm }, products, config), OrderError);
  }
});

test('rechaza datos de cliente o dirección incompletos', () => {
  const items = [{ id: 'sticker-twh', size: 'Única', design: 'cl-shop', qty: 1 }];
  assert.throws(() => buildOrder({ items, customer: { ...customer, email: 'malo' }, shipping: rm }, products, config), /correo/);
  assert.throws(() => buildOrder({ items, customer: { ...customer, phone: '123' }, shipping: rm }, products, config), /teléfono/);
  assert.throws(() => buildOrder({ items, customer, shipping: { ...rm, region: 'Mendoza' } }, products, config), /región/);
  assert.throws(() => buildOrder({ items, customer, shipping: { ...rm, address: '' } }, products, config), /dirección/);
  assert.throws(() => buildOrder({ items: [], customer, shipping: rm }, products, config), /vacío/);
});
