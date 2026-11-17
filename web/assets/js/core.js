// Lógica compartida por la tienda, el panel de admin y las funciones de Firebase:
// mezcla del catálogo base con lo editado en el panel (precio, estado, stock), stock por talla
// y cálculo de la promesa de entrega en días hábiles.
(function (root) {
  var STATUS = {
    disponible: 'Disponible',
    proximamente: 'Próximamente',
    oculto: 'Oculto'
  };

  var ORDER_STATUS = {
    pendiente_pago: 'Pago pendiente',
    pagado: 'Pagado · por preparar',
    preparando: 'Preparando',
    despachado: 'Despachado',
    entregado: 'Entregado',
    cancelado: 'Cancelado'
  };
  // Pedidos que todavía hay que entregar (los que cuentan para las alertas)
  var OPEN_STATUS = ['pagado', 'preparando'];

  // Feriados de Chile (revisar y completar cada año desde el panel → Ajustes)
  var FERIADOS_CL = [
    '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29', '2026-07-16',
    '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08', '2026-12-25',
    '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21', '2027-06-21', '2027-06-28', '2027-07-16',
    '2027-08-15', '2027-09-18', '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01', '2027-12-08', '2027-12-25'
  ];

  var DEFAULT_SETTINGS = { deliveryDaysRM: 3, deliveryDaysRegiones: 7, alertDays: 2, holidays: FERIADOS_CL };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // Clave de stock: el color, o "unico" si el producto no tiene colores
  function stockKey(color) { return color || 'unico'; }
  function stockColors(p) { return p.colors && p.colors.length ? p.colors : ['unico']; }

  // remote = { products: { id: { name, price, desc, status, stock } }, settings: {...} }
  function mergeCatalog(base, remote) {
    var data = clone(base);
    var r = remote || {};
    var rp = r.products || {};
    data.products = data.products.map(function (p) {
      var o = rp[p.id] || {};
      p.status = STATUS[o.status] ? o.status : (p.active === false ? 'oculto' : (STATUS[p.status] ? p.status : 'disponible'));
      if (typeof o.name === 'string' && o.name.trim()) p.name = o.name.trim();
      if (typeof o.desc === 'string' && o.desc.trim()) p.desc = o.desc.trim();
      if (Number.isInteger(o.price) && o.price > 0) p.price = o.price;
      p.stock = o.stock && typeof o.stock === 'object' ? o.stock : null;
      return p;
    });
    var s = r.settings || {};
    data.settings = {
      deliveryDaysRM: posInt(s.deliveryDaysRM, DEFAULT_SETTINGS.deliveryDaysRM),
      deliveryDaysRegiones: posInt(s.deliveryDaysRegiones, DEFAULT_SETTINGS.deliveryDaysRegiones),
      alertDays: posInt(s.alertDays, DEFAULT_SETTINGS.alertDays),
      holidays: Array.isArray(s.holidays) ? s.holidays.slice() : FERIADOS_CL.slice()
    };
    return data;
  }
  function posInt(v, d) { v = Number(v); return Number.isInteger(v) && v >= 0 && v < 100 ? v : d; }

  // null = el producto no controla stock (siempre disponible)
  function stockOf(p, color, size) {
    if (!p.stock) return null;
    var byColor = p.stock[stockKey(color)] || {};
    var n = Number(byColor[size]);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
  function totalStock(p, color) {
    if (!p.stock) return null;
    var colors = color ? [color] : stockColors(p);
    var t = 0;
    colors.forEach(function (c) { p.sizes.forEach(function (s) { t += stockOf(p, c === 'unico' ? '' : c, s); }); });
    return t;
  }
  function isSoldOut(p, color) { return p.stock ? totalStock(p, color) === 0 : false; }
  function isBuyable(p) { return p.status === 'disponible' && !isSoldOut(p); }

  // ---------- Fechas (siempre como 'AAAA-MM-DD' en hora de Chile) ----------
  function todayCL(date) {
    var d = date || new Date();
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch (e) {
      return d.toISOString().slice(0, 10);
    }
  }
  function parseYmd(s) { var a = String(s).split('-').map(Number); return new Date(Date.UTC(a[0], a[1] - 1, a[2])); }
  function fmtYmd(d) { return d.toISOString().slice(0, 10); }
  function isBusinessDay(ymd, holidays) {
    var dow = parseYmd(ymd).getUTCDay();
    return dow !== 0 && dow !== 6 && (holidays || []).indexOf(ymd) < 0;
  }
  // Suma n días hábiles a partir del día siguiente (sin fines de semana ni feriados)
  function addBusinessDays(ymd, n, holidays) {
    var d = parseYmd(ymd);
    var left = n;
    while (left > 0) {
      d.setUTCDate(d.getUTCDate() + 1);
      if (isBusinessDay(fmtYmd(d), holidays)) left--;
    }
    return fmtYmd(d);
  }
  // Días de calendario entre hoy y la fecha prometida (negativo = atrasado)
  function daysUntil(ymd, today) {
    return Math.round((parseYmd(ymd) - parseYmd(today || todayCL())) / 86400000);
  }
  function deliveryDaysFor(zone, settings) {
    var s = settings || DEFAULT_SETTINGS;
    return zone === 'regiones' ? s.deliveryDaysRegiones : s.deliveryDaysRM;
  }
  function promiseDate(paidYmd, zone, settings) {
    var s = settings || DEFAULT_SETTINGS;
    return addBusinessDays(paidYmd, deliveryDaysFor(zone, s), s.holidays);
  }

  var api = {
    STATUS: STATUS, ORDER_STATUS: ORDER_STATUS, OPEN_STATUS: OPEN_STATUS, FERIADOS_CL: FERIADOS_CL, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    mergeCatalog: mergeCatalog, stockKey: stockKey, stockColors: stockColors, stockOf: stockOf, totalStock: totalStock,
    isSoldOut: isSoldOut, isBuyable: isBuyable,
    todayCL: todayCL, addBusinessDays: addBusinessDays, isBusinessDay: isBusinessDay, daysUntil: daysUntil,
    deliveryDaysFor: deliveryDaysFor, promiseDate: promiseDate
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWHCore = api;
})(this);
