const test = require('node:test');
const assert = require('node:assert');
const base = require('../data/catalog.js');
const C = require('../assets/js/core.js');
const { buildOrder, OrderError } = require('../lib/order');

const customer = { name: 'Juan Pérez', email: 'juan@ejemplo.cl', phone: '+56 9 1234 5678' };
const rm = { method: 'despacho', region: 'Región Metropolitana', comuna: 'Ñuñoa', address: 'Irarrázaval 1234' };
const POLERA = base.products.find((p) => p.type === 'polera' && p.colors.includes('negro')).id;

test('sin datos del panel, todo queda disponible y sin control de stock', () => {
  const d = C.mergeCatalog(base, null);
  // los productos nuevos del configurador vienen con status 'proximamente' en el catálogo base; el resto, disponibles
  const statusBase = Object.fromEntries(base.products.map((p) => [p.id, p.status || 'disponible']));
  assert.ok(d.products.every((p) => p.status === statusBase[p.id] && p.stock === null));
  assert.strictEqual(d.settings.deliveryDaysRM, 3);
  assert.strictEqual(d.products.length, base.products.length);
});

test('el panel cambia precio, nombre, descripción y estado', () => {
  const d = C.mergeCatalog(base, { products: { [POLERA]: { price: 24990, name: 'Nueva', desc: 'Otra', status: 'proximamente' } } });
  const p = d.products.find((x) => x.id === POLERA);
  assert.deepStrictEqual([p.price, p.name, p.desc, p.status], [24990, 'Nueva', 'Otra', 'proximamente']);
  // no toca el catálogo base
  assert.notStrictEqual(base.products.find((x) => x.id === POLERA).price, 24990);
});

test('valores inválidos del panel se ignoran', () => {
  const d = C.mergeCatalog(base, { products: { [POLERA]: { price: -5, status: 'raro', name: '  ' } } });
  const p = d.products.find((x) => x.id === POLERA);
  const b = base.products.find((x) => x.id === POLERA);
  assert.deepStrictEqual([p.price, p.status, p.name], [b.price, 'disponible', b.name]);
});

test('stock por color y talla; agotado cuando todo es 0', () => {
  const d = C.mergeCatalog(base, { products: { [POLERA]: { stock: { negro: { M: 2, L: 0 }, blanco: {} } } } });
  const p = d.products.find((x) => x.id === POLERA);
  assert.strictEqual(C.stockOf(p, 'negro', 'M'), 2);
  assert.strictEqual(C.stockOf(p, 'negro', 'L'), 0);
  assert.strictEqual(C.stockOf(p, 'blanco', 'S'), 0);
  assert.strictEqual(C.isSoldOut(p, 'blanco'), true);
  assert.strictEqual(C.isSoldOut(p), false);
  assert.strictEqual(C.totalStock(p), 2);
});

test('pedido rechaza productos Próximamente', () => {
  const d = C.mergeCatalog(base, { products: { [POLERA]: { status: 'proximamente' } } });
  assert.throws(() => buildOrder({ items: [{ id: POLERA, size: 'M', color: 'negro', qty: 1 }], customer, shipping: rm }, d.products, d.config), OrderError);
});

test('pedido valida stock sumando líneas iguales', () => {
  const d = C.mergeCatalog(base, { products: { [POLERA]: { stock: { negro: { M: 2 } } } } });
  const ok = buildOrder({ items: [{ id: POLERA, size: 'M', color: 'negro', qty: 2 }], customer, shipping: rm }, d.products, d.config);
  assert.strictEqual(ok.lines[0].qty, 2);
  assert.throws(
    () => buildOrder({ items: [{ id: POLERA, size: 'M', color: 'negro', qty: 1 }, { id: POLERA, size: 'M', color: 'negro', qty: 2 }], customer, shipping: rm }, d.products, d.config),
    /Solo quedan 2/
  );
  assert.throws(() => buildOrder({ items: [{ id: POLERA, size: 'L', color: 'negro', qty: 1 }], customer, shipping: rm }, d.products, d.config), /Se agotó/);
});

test('días hábiles: salta fin de semana y feriados', () => {
  // viernes 2026-11-13 + 3 hábiles = miércoles 18
  assert.strictEqual(C.addBusinessDays('2026-11-13', 3, []), '2026-11-18');
  // jueves 2026-09-17 + 1 hábil salta 18 y 19 de septiembre (y el fin de semana) → lunes 21
  assert.strictEqual(C.addBusinessDays('2026-09-17', 1, C.FERIADOS_CL), '2026-09-21');
  // diciembre: 2026-12-24 (jueves) + 1 salta Navidad → lunes 28
  assert.strictEqual(C.addBusinessDays('2026-12-24', 1, C.FERIADOS_CL), '2026-12-28');
});

test('promesa según zona y días restantes', () => {
  const s = { deliveryDaysRM: 3, deliveryDaysRegiones: 5, rangeDays: 1, holidays: [] };
  // pagado lunes 16: RM llega jueves 19 a viernes 20; regiones lunes 23 a martes 24
  assert.deepStrictEqual(C.promiseRange('2026-11-16', 'rm', s), { from: '2026-11-19', to: '2026-11-20' });
  assert.deepStrictEqual(C.promiseRange('2026-11-16', 'regiones', s), { from: '2026-11-23', to: '2026-11-24' });
  assert.strictEqual(C.promiseDate('2026-11-16', 'rm', s), '2026-11-20');
  // retiro con fecha (pago manual en el panel): día hábil siguiente
  assert.strictEqual(C.promiseDate('2026-11-16', 'retiro', s), '2026-11-17');
  assert.strictEqual(C.daysUntil('2026-11-19', '2026-11-17'), 2);
  assert.strictEqual(C.daysUntil('2026-11-15', '2026-11-17'), -2);
});

test('retiro: mismo día antes de la hora de corte, si no el día hábil siguiente', () => {
  const s = { pickupCutoff: '06:30', holidays: [] };
  // 2026-11-18 (miércoles) en Chile es UTC-3
  assert.strictEqual(C.pickupDate(new Date('2026-11-18T09:00:00Z'), s), '2026-11-18'); // 06:00 Chile
  assert.strictEqual(C.pickupDate(new Date('2026-11-18T09:45:00Z'), s), '2026-11-19'); // 06:45 Chile
  assert.strictEqual(C.pickupDate(new Date('2026-11-20T23:00:00Z'), s), '2026-11-23'); // viernes 20:00 → lunes
  assert.strictEqual(C.pickupDate(new Date('2026-11-21T08:00:00Z'), s), '2026-11-23'); // sábado temprano → lunes
});

test('textos de fechas', () => {
  assert.strictEqual(C.rangeText({ from: '2026-11-24', to: '2026-11-25' }), 'entre el martes 24 y el miércoles 25 de noviembre');
  assert.strictEqual(C.rangeText({ from: '2026-11-30', to: '2026-12-01' }), 'entre el lunes 30 de noviembre y el martes 1 de diciembre');
  assert.strictEqual(C.dayWord('2026-11-18', '2026-11-18'), 'hoy');
  assert.strictEqual(C.dayWord('2026-11-19', '2026-11-18'), 'mañana');
  assert.strictEqual(C.dayWord('2026-11-23', '2026-11-20'), 'el lunes 23');
});

test('OTD: entregados a tiempo vs atrasados', () => {
  const orders = [
    { status: 'entregado', promisedDate: '2026-11-20', deliveredDate: '2026-11-20', shipping: { method: 'despacho' } },
    { status: 'entregado', promisedDate: '2026-11-20', deliveredDate: '2026-11-23', shipping: { method: 'despacho' } },
    { status: 'despachado', promisedDate: '2026-11-17', shippedDate: '2026-11-17', shipping: { method: 'retiro' } }, // listo para retiro a tiempo
    { status: 'preparando', promisedDate: '2026-11-10', shipping: { method: 'despacho' } }, // vencido sin entregar
    { status: 'cancelado', promisedDate: '2026-11-10', shipping: { method: 'despacho' } },
  ];
  const r = C.otd(orders, '2026-11-25');
  assert.strictEqual(r.total, 3);
  assert.strictEqual(r.onTime, 2);
  assert.strictEqual(r.late, 1);
  assert.strictEqual(r.pct, 66.7);
  assert.strictEqual(r.openLate, 1);
});
