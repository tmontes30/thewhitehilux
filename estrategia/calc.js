// Cálculos de la estrategia (los comparten planificador.html y exportar-excel.js).
// Entrada: catálogo (web/data/catalog.js), costos (estrategia/costos.js) y core (web/assets/js/core.js para SKU).
(function (root) {
  function num(v) { v = Number(v); return isFinite(v) ? v : 0; }
  function round(n) { return Math.round(n); }

  // Ubicaciones de estampado/bordado de un producto según sus vistas del catálogo
  function decoKeys(p) {
    var keys = [];
    (p.views || []).forEach(function (v) {
      if (v.shape === 'cap') {
        var logo = (p.features || []).filter(function (f) { return f[0] === 'Logo'; })[0];
        keys.push(logo && /bordad/i.test(logo[1]) ? 'cap-bordado' : 'cap-parche');
      } else if (keys.indexOf(v.shape) < 0) keys.push(v.shape);
    });
    return keys;
  }

  function dropUnits(K, products) {
    return products.reduce(function (s, p) { return s + num((K.drop || {})[p.id]); }, 0);
  }

  // Desglose del costo de 1 unidad (sin venta)
  function unitCost(p, color, K, totalUnits) {
    var lines = [];
    var prendaT = (K.prenda || {})[p.type] || {};
    var base = prendaT[color] != null ? prendaT[color] : (prendaT._ != null ? prendaT._ : 0);
    if (base) lines.push(['Prenda lisa' + (color ? ' ' + color : ''), num(base)]);
    decoKeys(p).forEach(function (k) { lines.push(['Decoración ' + k, num((K.decoracion || {})[k])]); });
    ((K.empaque || {})[p.type] || []).forEach(function (e) { if (num(e[1])) lines.push([e[0], num(e[1])]); });
    if (totalUnits > 0 && num(K.fletePorCompra)) lines.push(['Flete compra (repartido)', num(K.fletePorCompra) / totalUnits]);
    var total = lines.reduce(function (s, l) { return s + l[1]; }, 0);
    return { lines: lines, total: total };
  }

  // Costos de vender 1 unidad: comisión MP + parte del envío que absorbes
  function saleCost(price, K) {
    var mp = K.mercadoPago || {}, d = K.despacho || {}, upp = Math.max(num(K.unidadesPorPedido), 1);
    var comision = price * num(mp.pct) / 100 + num(mp.fijo) / upp;
    var envio = (num(d.mixRM) / 100) * (num(d.pctGratisRM) / 100) * num(d.rm) / upp;
    return { comision: comision, envio: envio, total: comision + envio };
  }

  function margin(p, color, K, totalUnits, price) {
    price = price != null ? price : num(p.price);
    var c = unitCost(p, color, K, totalUnits), s = saleCost(price, K);
    var m = price - c.total - s.total;
    return { price: price, costo: c.total, lines: c.lines, comision: s.comision, envio: s.envio,
      margen: m, margenPct: price ? m / price * 100 : 0, markup: c.total ? price / c.total : 0 };
  }

  // Reparte "total" según pesos (método del resto mayor), con un mínimo por casilla si alcanza
  function split(total, weights, min) {
    var keys = Object.keys(weights).filter(function (k) { return num(weights[k]) > 0; });
    var out = {}; keys.forEach(function (k) { out[k] = 0; });
    total = Math.max(0, Math.floor(num(total)));
    if (!keys.length || !total) return out;
    min = num(min);
    var sum = keys.reduce(function (s, k) { return s + num(weights[k]); }, 0);
    var exact = {}; keys.forEach(function (k) { exact[k] = total * num(weights[k]) / sum; out[k] = Math.floor(exact[k]); });
    var left = total - keys.reduce(function (s, k) { return s + out[k]; }, 0);
    // el resto va a la mayor fracción; en empate, a la talla con más peso
    var order = keys.slice().sort(function (a, b) { return (exact[b] - out[b]) - (exact[a] - out[a]) || num(weights[b]) - num(weights[a]); });
    for (var i = 0; i < left; i++) out[order[i % order.length]]++;
    // mínimo por casilla: se saca de la que más sobra respecto de su parte exacta
    if (min > 0 && total >= min * keys.length) {
      keys.forEach(function (k) {
        while (out[k] < min) {
          var donor = keys.filter(function (d) { return out[d] > min; })
            .sort(function (a, b) { return (out[b] - exact[b]) - (out[a] - exact[a]) || out[b] - out[a]; })[0];
          if (!donor) break;
          out[donor]--; out[k]++;
        }
      });
    }
    return out;
  }

  function colorWeights(p, K) {
    var w = {}, cs = (K.colorSplit || {})[p.type] || {};
    var colors = p.colors && p.colors.length ? p.colors : ['_'];
    colors.forEach(function (c) { w[c] = cs[c] != null ? num(cs[c]) : 1; });
    return w;
  }
  function sizeWeights(p, K) {
    var w = {}, cv = (K.curva || {})[p.type] || {};
    (p.sizes || ['Única']).forEach(function (s) { w[s] = cv[s] != null ? num(cv[s]) : 1; });
    return w;
  }

  function sku(p, color, size, core) {
    var base = p.sku || (core && core.defaultSku ? core.defaultSku(p) : p.id);
    var pp = { sku: base };
    return core && core.variantSku ? core.variantSku(pp, color === '_' ? '' : color, size) : [base, color, size].join('-');
  }

  // Plan de compra completo: una fila por SKU
  function plan(catalog, K, core) {
    var products = catalog.products || [];
    var totalUnits = dropUnits(K, products);
    var rows = [];
    products.forEach(function (p) {
      var qty = num((K.drop || {})[p.id]);
      if (!qty) return;
      var byColor = split(qty, colorWeights(p, K), 0);
      Object.keys(byColor).forEach(function (color) {
        var bySize = split(byColor[color], sizeWeights(p, K), K.minimoPorTalla);
        var uc = unitCost(p, color === '_' ? null : color, K, totalUnits).total;
        Object.keys(bySize).forEach(function (size) {
          if (!bySize[size]) return;
          rows.push({ product: p, id: p.id, name: p.name, type: p.type, color: color === '_' ? '' : color, size: size,
            sku: sku(p, color, size, core), qty: bySize[size], unitCost: uc, cost: uc * bySize[size],
            revenue: num(p.price) * bySize[size] });
        });
      });
    });
    var inversion = rows.reduce(function (s, r) { return s + r.cost; }, 0);
    var ventaPotencial = rows.reduce(function (s, r) { return s + r.revenue; }, 0);
    return { rows: rows, units: totalUnits, inversion: inversion, ventaPotencial: ventaPotencial };
  }

  function fixedMonthly(K) { return (K.gastosFijos || []).reduce(function (s, g) { return s + num(g[1]); }, 0); }

  // Resultado de cada escenario a 30/60/90 días
  function scenarios(catalog, K, core) {
    var pl = plan(catalog, K, core);
    var fijos = fixedMonthly(K);
    // margen de contribución promedio por peso vendido (antes de costo de mercadería)
    var neto = pl.rows.reduce(function (s, r) { return s + (r.revenue - saleCost(num(r.product.price), K).total * r.qty); }, 0);
    var netoRatio = pl.ventaPotencial ? neto / pl.ventaPotencial : 0;
    return (K.escenarios || []).map(function (e) {
      var out = { nombre: e.nombre, cortes: [] };
      [['d30', 1], ['d60', 2], ['d90', 3]].forEach(function (c) {
        var pct = num(e[c[0]]) / 100;
        var ventas = pl.ventaPotencial * pct;
        var caja = ventas * netoRatio - pl.inversion - fijos * c[1];
        var costoVendido = pl.inversion * pct;
        var utilidad = ventas * netoRatio - costoVendido - fijos * c[1];
        out.cortes.push({ dias: c[1] * 30, pct: pct * 100, unidades: round(pl.units * pct), ventas: ventas,
          caja: caja, utilidad: utilidad, stockRestante: pl.inversion - costoVendido });
      });
      return out;
    });
  }

  // Punto de equilibrio: % del drop que hay que vender para recuperar inversión + fijos de N meses
  function breakEven(catalog, K, core, months) {
    var pl = plan(catalog, K, core);
    var neto = pl.rows.reduce(function (s, r) { return s + (r.revenue - saleCost(num(r.product.price), K).total * r.qty); }, 0);
    var need = pl.inversion + fixedMonthly(K) * (months || 1);
    return { pct: neto ? need / neto * 100 : Infinity, unidades: neto ? Math.ceil(pl.units * need / neto) : Infinity, need: need };
  }

  // Punto de reorden por producto: unidades que deben quedar cuando pides de nuevo
  function reorder(dailySales, type, K) {
    var dias = num((K.diasProduccion || {})[type]) + num(K.diasSeguridad);
    return Math.ceil(num(dailySales) * dias);
  }

  // Lee el CSV "ventas por SKU" del panel (separado por ;)
  function parseSalesCsv(text) {
    var lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(function (l) { return l.trim(); });
    if (!lines.length) return [];
    function cells(l) { var out = [], cur = '', q = false; for (var i = 0; i < l.length; i++) { var ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"') q = true; else if (ch === ';' || ch === ',' && l.indexOf(';') < 0) { out.push(cur); cur = ''; } else cur += ch; }
      out.push(cur); return out; }
    var head = cells(lines[0]).map(function (h) { return h.trim().toLowerCase(); });
    var iS = head.indexOf('sku'), iU = head.indexOf('unidades'), iC = head.indexOf('categoría'), iP = head.indexOf('producto'), iV = head.indexOf('ventas');
    return lines.slice(1).map(function (l) {
      var c = cells(l), s = String(c[iS] || ''), parts = s.split('-');
      var size = parts.filter(function (x) { return /^(XS|S|M|L|XL|XXL|XXXL|U)$/.test(x); }).pop() || '';
      var color = parts.indexOf('NEG') >= 0 ? 'negro' : parts.indexOf('BLA') >= 0 ? 'blanco' : '';
      return { sku: s, producto: c[iP] || '', categoria: c[iC] || '', unidades: num(c[iU]), ventas: num(String(c[iV] || '').replace(/[^\d-]/g, '')), size: size, color: color };
    }).filter(function (r) { return r.sku; });
  }

  var api = { decoKeys: decoKeys, unitCost: unitCost, saleCost: saleCost, margin: margin, split: split, plan: plan,
    scenarios: scenarios, breakEven: breakEven, reorder: reorder, fixedMonthly: fixedMonthly, dropUnits: dropUnits,
    parseSalesCsv: parseSalesCsv, sku: sku };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TWHPlan = api;
})(this);
