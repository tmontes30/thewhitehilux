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

  // deliveryDays*: días hábiles hasta el primer día del rango; rangeDays: largo del rango ("llega entre martes y miércoles")
  // pickupCutoff: pagos antes de esta hora (Chile) se retiran el mismo día hábil; después, al día hábil siguiente.
  //   La hora de corte NO se muestra al cliente: solo ve "Retiro gratis hoy" o "mañana".
  var DEFAULT_SETTINGS = { deliveryDaysRM: 3, deliveryDaysRegiones: 5, rangeDays: 1, alertDays: 2, pickupCutoff: '06:30', holidays: FERIADOS_CL };

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- SKU ----------
  // SKU base por producto (editable en el panel) y SKU por variante: BASE-COLOR-TALLA[-DISEÑO]
  var TYPE_CODE = { polera: 'POL', poleron: 'PLR', jockey: 'JCK', stickers: 'STK', neumaticos: 'NEU' };
  var COLOR_CODE = { negro: 'NEG', blanco: 'BLA' };
  var SKIP_WORDS = /^(twh|algodon|de|del|con|el|la|y|10|cm)$/;
  function defaultSku(p) {
    var words = p.id.split('-').filter(function (w) { return w && w !== p.type && w !== 'polera' && w !== 'poleron' && w !== 'jockey' && w !== 'sticker' && !SKIP_WORDS.test(w); });
    var ini = words.map(function (w) { return /^\d/.test(w) ? w : w[0]; }).join('').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    return (TYPE_CODE[p.type] || 'TWH') + '-' + (ini || 'X');
  }
  function cleanSku(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 24); }
  function variantSku(p, color, size, design) {
    return [p.sku, color ? (COLOR_CODE[color] || color.slice(0, 3).toUpperCase()) : '', size === 'Única' || !size ? 'U' : size,
      design ? design.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) : ''].filter(Boolean).join('-');
  }

  // ---------- Ofertas automáticas (precio tachado en la tienda) ----------
  // offer = { name, kind: 'percent'|'amount', value, scope: 'all'|'category'|'products', targets: [], from, to, active }
  function inDates(o, today) { return (!o.from || today >= o.from) && (!o.to || today <= o.to); }
  function offerApplies(o, p, today) {
    if (!o || o.active === false || !(Number(o.value) > 0) || !inDates(o, today)) return false;
    if (o.scope === 'category') return (o.targets || []).indexOf(p.type) >= 0;
    if (o.scope === 'products') return (o.targets || []).indexOf(p.id) >= 0;
    return true;
  }
  function offerPrice(o, price) {
    var v = Number(o.value);
    var out = o.kind === 'amount' ? price - v : Math.round((price * (1 - Math.min(v, 95) / 100)) / 10) * 10;
    return Math.max(100, Math.round(out));
  }
  // Imágenes del producto: en poleras y polerones, frente → espalda → resto (frente-2...)
  function orderedImages(p, color) {
    var imgs = p.imagesByColor ? (p.imagesByColor[color || p.colors[0]] || []) : (p.images || []);
    if (p.type !== 'polera' && p.type !== 'poleron') return imgs;
    var rank = function (src) { return /-frente\.\w+$/.test(src) ? 0 : /-espalda/.test(src) ? 1 : /-frente-/.test(src) ? 2 : 3; };
    return imgs.slice().sort(function (a, b) { return rank(a) - rank(b); });
  }

  // Clave de stock: el color, o "unico" si el producto no tiene colores
  function stockKey(color) { return color || 'unico'; }
  // Variantes de stock: colores (ropa), diseños (sticker: un stock por diseño) o 'unico'
  function stockColors(p) { return p.designs && p.designs.length ? p.designs.map(function (d) { return d.id; }) : p.colors && p.colors.length ? p.colors : ['unico']; }

  // remote = { products: { id: { name, price, desc, status, stock } }, settings: {...} }
  function mergeCatalog(base, remote, today) {
    var data = clone(base);
    var r = remote || {};
    var rp = r.products || {};
    var day = today || todayCL();
    var offers = r.offers || {};
    var usedSku = {};
    data.products = data.products.map(function (p) {
      var o = rp[p.id] || {};
      p.status = STATUS[o.status] ? o.status : (p.active === false ? 'oculto' : (STATUS[p.status] ? p.status : 'disponible'));
      if (typeof o.name === 'string' && o.name.trim()) p.name = o.name.trim();
      if (typeof o.desc === 'string' && o.desc.trim()) p.desc = o.desc.trim();
      if (Number.isInteger(o.price) && o.price > 0) p.price = o.price;
      p.stock = o.stock && typeof o.stock === 'object' ? o.stock : null;
      // SKU: el del panel o uno generado; sin repetidos
      var sku = cleanSku(o.sku) || defaultSku(p);
      if (usedSku[sku]) { var n = 2; while (usedSku[sku + n]) n++; sku = sku + n; }
      usedSku[sku] = true;
      p.sku = sku;
      // Mejor oferta vigente
      p.listPrice = p.price;
      Object.keys(offers).forEach(function (k) {
        var of = offers[k];
        if (!offerApplies(of, p, day)) return;
        var np = offerPrice(of, p.listPrice);
        if (np < p.price) { p.price = np; p.offer = { id: k, name: of.name || '' }; }
      });
      if (p.price < p.listPrice) {
        p.compareAt = p.listPrice;
        p.offerPct = Math.round((1 - p.price / p.listPrice) * 100);
      }
      return p;
    });
    data.offers = offers;
    var s = r.settings || {};
    data.settings = {
      deliveryDaysRM: posInt(s.deliveryDaysRM, DEFAULT_SETTINGS.deliveryDaysRM),
      deliveryDaysRegiones: posInt(s.deliveryDaysRegiones, DEFAULT_SETTINGS.deliveryDaysRegiones),
      alertDays: posInt(s.alertDays, DEFAULT_SETTINGS.alertDays),
      rangeDays: posInt(s.rangeDays, DEFAULT_SETTINGS.rangeDays),
      pickupCutoff: /^([01]\d|2[0-3]):[0-5]\d$/.test(s.pickupCutoff || '') ? s.pickupCutoff : DEFAULT_SETTINGS.pickupCutoff,
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
  // Hora de Chile 'HH:MM'
  function timeCL(date) {
    var d = date || new Date();
    try {
      var t = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Santiago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);
      return t.replace(/^24/, '00');
    } catch (e) {
      return d.toISOString().slice(11, 16);
    }
  }
  // Día de retiro (Las Condes / Lo Barnechea) para un pago hecho en `date`
  function pickupDate(date, settings) {
    var s = settings || DEFAULT_SETTINGS;
    var day = todayCL(date);
    var cut = s.pickupCutoff || DEFAULT_SETTINGS.pickupCutoff;
    if (isBusinessDay(day, s.holidays) && timeCL(date) < cut) return day;
    return addBusinessDays(day, 1, s.holidays);
  }
  // Rango de entrega { from, to } para un pago hecho en `date` (Date) o el día `date` ('AAAA-MM-DD')
  function promiseRange(date, zone, settings) {
    var s = settings || DEFAULT_SETTINGS;
    if (zone === 'retiro') {
      var p = typeof date === 'string' ? addBusinessDays(date, 1, s.holidays) : pickupDate(date, s);
      return { from: p, to: p };
    }
    var day = typeof date === 'string' ? date : todayCL(date);
    var from = addBusinessDays(day, deliveryDaysFor(zone, s), s.holidays);
    var rng = s.rangeDays == null ? DEFAULT_SETTINGS.rangeDays : s.rangeDays;
    return { from: from, to: addBusinessDays(from, rng, s.holidays) };
  }
  // Fecha límite (último día del rango): la que se usa para alertas y OTD
  function promiseDate(paidYmd, zone, settings) { return promiseRange(paidYmd, zone, settings).to; }

  // ---------- Textos de fechas ----------
  var DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  // 'martes 24'
  function dayName(ymd) { var d = parseYmd(ymd); return DIAS[d.getUTCDay()] + ' ' + d.getUTCDate(); }
  // 'hoy' / 'mañana' / 'el martes 24'
  function dayWord(ymd, today) {
    var n = daysUntil(ymd, today);
    return n === 0 ? 'hoy' : n === 1 ? 'mañana' : 'el ' + dayName(ymd);
  }
  // 'entre el martes 24 y el miércoles 25 de noviembre'
  function rangeText(r) {
    var b = parseYmd(r.to);
    var tail = ' de ' + MESES[b.getUTCMonth()];
    if (r.from === r.to) return 'el ' + dayName(r.to) + tail;
    var a = parseYmd(r.from);
    var head = 'el ' + dayName(r.from) + (a.getUTCMonth() !== b.getUTCMonth() ? ' de ' + MESES[a.getUTCMonth()] : '');
    return 'entre ' + head + ' y el ' + dayName(r.to) + tail;
  }

  // ---------- Cumplimiento de entregas (OTD = On Time Delivery) ----------
  // Fecha en que se cumplió la entrega: despacho → entregado; retiro → listo para retiro (o entregado)
  function fulfilledDate(o) {
    var retiro = o.shipping && o.shipping.method === 'retiro';
    return retiro ? (o.shippedDate || o.deliveredDate || '') : (o.deliveredDate || '');
  }
  // true = a tiempo, false = atrasado, null = todavía no se entrega (o no aplica)
  function onTime(o) {
    if (!o.promisedDate) return null;
    var f = fulfilledDate(o);
    return f ? f <= o.promisedDate : null;
  }
  // { total, onTime, late, pct, openLate } de los pedidos entregados (pct = null si no hay)
  function otd(orders, today) {
    var t = today || todayCL();
    var r = { total: 0, onTime: 0, late: 0, pct: null, openLate: 0 };
    (orders || []).forEach(function (o) {
      if (o.status === 'cancelado' || o.status === 'pendiente_pago') return;
      var ok = onTime(o);
      if (ok === null) { if (o.promisedDate && o.promisedDate < t && !fulfilledDate(o)) r.openLate++; return; }
      r.total++;
      if (ok) r.onTime++; else r.late++;
    });
    r.pct = r.total ? Math.round((r.onTime / r.total) * 1000) / 10 : null;
    return r;
  }

  var api = {
    STATUS: STATUS, ORDER_STATUS: ORDER_STATUS, OPEN_STATUS: OPEN_STATUS, FERIADOS_CL: FERIADOS_CL, DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    mergeCatalog: mergeCatalog, stockKey: stockKey, stockColors: stockColors, stockOf: stockOf, totalStock: totalStock,
    isSoldOut: isSoldOut, isBuyable: isBuyable,
    todayCL: todayCL, addBusinessDays: addBusinessDays, isBusinessDay: isBusinessDay, daysUntil: daysUntil,
    deliveryDaysFor: deliveryDaysFor, promiseDate: promiseDate, promiseRange: promiseRange, pickupDate: pickupDate, timeCL: timeCL,
    dayName: dayName, dayWord: dayWord, rangeText: rangeText, fulfilledDate: fulfilledDate, onTime: onTime, otd: otd,
    defaultSku: defaultSku, cleanSku: cleanSku, variantSku: variantSku, COLOR_CODE: COLOR_CODE,
    offerApplies: offerApplies, offerPrice: offerPrice, inDates: inDates, orderedImages: orderedImages
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWHCore = api;
})(this);
