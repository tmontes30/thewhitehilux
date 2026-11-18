const test = require('node:test');
const assert = require('node:assert');
const base = require('../data/catalog.js');
const C = require('../assets/js/core.js');
const { buildOrder, priceCart, toMercadoPagoItems, OrderError } = require('../lib/order');

const customer = { name: 'Juan Pérez', email: 'juan@ejemplo.cl', phone: '+56 9 1234 5678' };
const rm = { method: 'despacho', region: 'Región Metropolitana', comuna: 'Ñuñoa', address: 'Irarrázaval 1234' };
const POLERA = base.products.find((p) => p.type === 'polera' && p.colors.includes('negro'));
const POLERON = base.products.find((p) => p.type === 'poleron');
const HOY = '2026-11-18';

test('oferta automática: precio tachado y precio rebajado redondeado a $10', () => {
  const d = C.mergeCatalog(base, { offers: { a: { name: 'Black', kind: 'percent', value: 20, scope: 'category', targets: ['polera'] } } }, HOY);
  const p = d.products.find((x) => x.id === POLERA.id);
  assert.strictEqual(p.compareAt, POLERA.price);
  assert.strictEqual(p.price % 10, 0);
  assert.strictEqual(p.offerPct, 20);
  assert.strictEqual(d.products.find((x) => x.id === POLERON.id).compareAt, undefined);
});

test('oferta fuera de fecha, pausada o de otro producto no aplica', () => {
  const offers = {
    a: { kind: 'percent', value: 30, scope: 'all', from: '2026-12-01' },
    b: { kind: 'percent', value: 30, scope: 'all', active: false },
    c: { kind: 'amount', value: 5000, scope: 'products', targets: [POLERON.id] },
  };
  const d = C.mergeCatalog(base, { offers }, HOY);
  assert.strictEqual(d.products.find((x) => x.id === POLERA.id).compareAt, undefined);
  assert.strictEqual(d.products.find((x) => x.id === POLERON.id).price, POLERON.price - 5000);
});

test('con dos ofertas gana la más conveniente', () => {
  const offers = { a: { kind: 'percent', value: 10, scope: 'all' }, b: { kind: 'amount', value: 6000, scope: 'products', targets: [POLERA.id] } };
  const d = C.mergeCatalog(base, { offers }, HOY);
  assert.strictEqual(d.products.find((x) => x.id === POLERA.id).price, POLERA.price - 6000);
});

test('el pedido usa el precio de oferta y guarda el SKU', () => {
  const d = C.mergeCatalog(base, { offers: { a: { kind: 'percent', value: 20, scope: 'all' } } }, HOY);
  const o = buildOrder({ items: [{ id: POLERA.id, size: 'M', color: 'negro', qty: 1 }], customer, shipping: rm }, d.products, d.config);
  const p = d.products.find((x) => x.id === POLERA.id);
  assert.strictEqual(o.lines[0].unit_price, p.price);
  assert.strictEqual(o.lines[0].list_price, POLERA.price);
  assert.match(o.lines[0].sku, /^POL-.+-NEG-M$/);
});

test('cupón de porcentaje: descuenta, reparte al peso y cuadra con Mercado Pago', () => {
  const d = C.mergeCatalog(base, null, HOY);
  const coupon = { kind: 'percent', value: 15, scope: 'all' };
  const o = buildOrder(
    { items: [{ id: POLERA.id, size: 'M', color: 'negro', qty: 3 }, { id: POLERON.id, size: 'L', color: 'negro', qty: 1 }], customer, shipping: rm },
    d.products, d.config, { couponCode: 'twh-15', coupon, today: HOY }
  );
  const sub = POLERA.price * 3 + POLERON.price;
  assert.strictEqual(o.discount.code, 'TWH15');
  assert.strictEqual(o.discount.amount, Math.round(sub * 0.15));
  assert.strictEqual(o.lines.reduce((s, l) => s + l.discount, 0), o.discount.amount);
  const items = toMercadoPagoItems(o);
  assert.strictEqual(items.reduce((s, i) => s + i.unit_price * i.quantity, 0), o.total);
  assert.ok(items.every((i) => Number.isInteger(i.unit_price) && i.unit_price > 0));
});

test('cupón de monto fijo solo para una categoría', () => {
  const d = C.mergeCatalog(base, null, HOY);
  const coupon = { kind: 'amount', value: 5000, scope: 'category', targets: ['poleron'] };
  const o = buildOrder(
    { items: [{ id: POLERA.id, size: 'M', color: 'negro', qty: 1 }, { id: POLERON.id, size: 'L', color: 'negro', qty: 1 }], customer, shipping: rm },
    d.products, d.config, { couponCode: 'POLERON5', coupon, today: HOY }
  );
  assert.strictEqual(o.discount.amount, 5000);
  assert.strictEqual(o.lines.find((l) => l.id === POLERA.id).discount, 0);
  assert.strictEqual(o.lines.find((l) => l.id === POLERON.id).discount, 5000);
});

test('el envío gratis se calcula con el monto ya descontado', () => {
  const d = C.mergeCatalog(base, null, HOY);
  const items = [{ id: POLERA.id, size: 'M', color: 'negro', qty: 2 }]; // 39.980 sin descuento: paga envío
  const sin = buildOrder({ items: [{ id: POLERA.id, size: 'M', color: 'negro', qty: 3 }], customer, shipping: rm }, d.products, d.config);
  assert.strictEqual(sin.shipping.free, true);
  const con = buildOrder({ items: [{ id: POLERA.id, size: 'M', color: 'negro', qty: 3 }], customer, shipping: rm }, d.products, d.config,
    { couponCode: 'X50', coupon: { kind: 'percent', value: 50, scope: 'all' }, today: HOY });
  assert.strictEqual(con.shipping.free, false);
  assert.ok(items);
});

test('cupón inválido: vencido, agotado, mínimo de compra, no aplica', () => {
  const d = C.mergeCatalog(base, null, HOY);
  const items = [{ id: POLERA.id, size: 'M', color: 'negro', qty: 1 }];
  const run = (coupon) => priceCart(items, d.products, d.config, { couponCode: 'X', coupon, today: HOY });
  assert.throws(() => run(null), /no existe/);
  assert.throws(() => run({ kind: 'percent', value: 10, to: '2026-11-01' }), /vigente/);
  assert.throws(() => run({ kind: 'percent', value: 10, maxUses: 5, uses: 5 }), /máximo/);
  assert.throws(() => run({ kind: 'percent', value: 10, minSubtotal: 50000 }), /desde \$50\.000/);
  assert.throws(() => run({ kind: 'percent', value: 10, scope: 'category', targets: ['jockey'] }), /no aplica/);
  assert.throws(() => run({ kind: 'percent', value: 10, active: false }), OrderError);
});
